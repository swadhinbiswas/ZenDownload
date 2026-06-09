import { invoke } from '@tauri-apps/api/core';

export type ScheduleMode = 'always' | 'window' | 'offpeak' | 'manual';

export interface ScheduleWindow {
  start_hour: number;
  end_hour: number;
  days: string[];
  max_concurrent: number;
  max_speed_bps: number | null;
}

export interface Schedule {
  id: string;
  name: string;
  mode: ScheduleMode;
  windows: ScheduleWindow[];
  default_max_concurrent: number;
  default_max_speed_bps: number | null;
  enabled: boolean;
  color: string;
}

export interface QueueStats {
  active_downloads: number;
  queued_downloads: number;
  current_max_concurrent: number;
  current_max_speed_bps: number | null;
  is_in_window: boolean;
  next_window_start: string | null;
  current_schedule: Schedule | null;
}

export const scheduleService = {
  list: () => invoke<Schedule[]>('list_schedules'),
  upsert: (schedule: Schedule) => invoke<void>('upsert_schedule', { schedule }),
  remove: (id: string) => invoke<void>('delete_schedule', { id }),
  pause: () => invoke<void>('pause_queue'),
  resume: () => invoke<void>('resume_queue'),
  stats: () => invoke<QueueStats>('get_queue_stats'),
};
