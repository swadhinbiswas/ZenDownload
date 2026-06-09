use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tokio::time::{interval, Duration};
use chrono::{Datelike, Local, Timelike, Weekday};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleMode {
    Always,
    Window,
    Offpeak,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleWindow {
    pub start_hour: u32,
    pub end_hour: u32,
    pub days: Vec<String>,
    pub max_concurrent: u32,
    pub max_speed_bps: Option<u64>,
}

impl Default for ScheduleWindow {
    fn default() -> Self {
        Self {
            start_hour: 9,
            end_hour: 17,
            days: vec!["mon".into(), "tue".into(), "wed".into(), "thu".into(), "fri".into()],
            max_concurrent: 3,
            max_speed_bps: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    pub name: String,
    pub mode: ScheduleMode,
    pub windows: Vec<ScheduleWindow>,
    pub default_max_concurrent: u32,
    pub default_max_speed_bps: Option<u64>,
    pub enabled: bool,
    pub color: String,
}

impl Default for Schedule {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Default".into(),
            mode: ScheduleMode::Always,
            windows: vec![],
            default_max_concurrent: 4,
            default_max_speed_bps: None,
            enabled: true,
            color: "#6366f1".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub active_downloads: u32,
    pub queued_downloads: u32,
    pub current_max_concurrent: u32,
    pub current_max_speed_bps: Option<u64>,
    pub is_in_window: bool,
    pub next_window_start: Option<String>,
    pub current_schedule: Option<Schedule>,
}

pub struct ScheduleEngine {
    schedules: Arc<RwLock<Vec<Schedule>>>,
    active: Arc<Mutex<u32>>,
    pub is_paused: Arc<Mutex<bool>>,
}

impl ScheduleEngine {
    pub fn new() -> Self {
        Self {
            schedules: Arc::new(RwLock::new(vec![Schedule::default()])),
            active: Arc::new(Mutex::new(0)),
            is_paused: Arc::new(Mutex::new(false)),
        }
    }

    pub async fn list_schedules(&self) -> Vec<Schedule> {
        self.schedules.read().await.clone()
    }

    pub async fn get_schedule(&self, id: &str) -> Option<Schedule> {
        self.schedules.read().await.iter().find(|s| s.id == id).cloned()
    }

    pub async fn upsert_schedule(&self, schedule: Schedule) -> Result<(), String> {
        let mut schedules = self.schedules.write().await;
        if let Some(existing) = schedules.iter_mut().find(|s| s.id == schedule.id) {
            *existing = schedule;
        } else {
            schedules.push(schedule);
        }
        Ok(())
    }

    pub async fn delete_schedule(&self, id: &str) -> Result<(), String> {
        let mut schedules = self.schedules.write().await;
        if schedules.len() <= 1 {
            return Err("Cannot delete the last schedule".into());
        }
        schedules.retain(|s| s.id != id);
        Ok(())
    }

    pub async fn pause(&self) {
        *self.is_paused.lock().await = true;
    }

    pub async fn resume(&self) {
        *self.is_paused.lock().await = false;
    }

    pub async fn should_allow_start(&self) -> (bool, Option<u64>, u32) {
        if *self.is_paused.lock().await {
            return (false, None, 0);
        }
        let schedules = self.schedules.read().await;
        let active = *self.active.lock().await;
        let (in_window, window) = self.current_window(&schedules);
        let max_concurrent = if in_window {
            window.as_ref().map(|w| w.max_concurrent).unwrap_or(4)
        } else {
            0
        };
        let max_speed = if in_window {
            window.as_ref().and_then(|w| w.max_speed_bps)
        } else {
            None
        };
        (active < max_concurrent, max_speed, max_concurrent)
    }

    pub async fn increment_active(&self) {
        let mut active = self.active.lock().await;
        *active += 1;
    }

    pub async fn decrement_active(&self) {
        let mut active = self.active.lock().await;
        if *active > 0 {
            *active -= 1;
        }
    }

    pub async fn stats(&self) -> QueueStats {
        let schedules = self.schedules.read().await;
        let (in_window, window) = self.current_window(&schedules);
        let active = *self.active.lock().await;
        QueueStats {
            active_downloads: active,
            queued_downloads: 0,
            current_max_concurrent: if in_window {
                window.as_ref().map(|w| w.max_concurrent).unwrap_or(4)
            } else {
                0
            },
            current_max_speed_bps: if in_window {
                window.and_then(|w| w.max_speed_bps)
            } else {
                None
            },
            is_in_window: in_window,
            next_window_start: self.next_window_start(&schedules),
            current_schedule: schedules.first().cloned(),
        }
    }

    fn current_window<'a>(&self, schedules: &'a [Schedule]) -> (bool, Option<&'a ScheduleWindow>) {
        let now = Local::now();
        let weekday = match now.weekday() {
            Weekday::Mon => "mon",
            Weekday::Tue => "tue",
            Weekday::Wed => "wed",
            Weekday::Thu => "thu",
            Weekday::Fri => "fri",
            Weekday::Sat => "sat",
            Weekday::Sun => "sun",
        };
        let hour = now.hour();

        for schedule in schedules.iter().filter(|s| s.enabled) {
            match schedule.mode {
                ScheduleMode::Always => return (true, None),
                ScheduleMode::Manual => return (false, None),
                ScheduleMode::Offpeak => {
                    if !(9..17).contains(&hour) || weekday == "sat" || weekday == "sun" {
                        return (true, schedule.windows.first());
                    }
                }
                ScheduleMode::Window => {
                    for w in &schedule.windows {
                        if w.days.iter().any(|d| d == weekday) && hour >= w.start_hour && hour < w.end_hour {
                            return (true, Some(w));
                        }
                    }
                }
            }
        }
        (false, None)
    }

    fn next_window_start(&self, schedules: &[Schedule]) -> Option<String> {
        let now = Local::now();
        for schedule in schedules.iter().filter(|s| s.enabled) {
            if matches!(schedule.mode, ScheduleMode::Window) {
                for w in &schedule.windows {
                    if w.start_hour > now.hour() {
                        return Some(format!("Today {}:00", w.start_hour));
                    }
                }
            }
        }
        None
    }
}

pub fn spawn_schedule_loop(engine: Arc<ScheduleEngine>) {
    tokio::spawn(async move {
        let mut tick = interval(Duration::from_secs(30));
        loop {
            tick.tick().await;
            let _stats = engine.stats().await;
        }
    });
}
