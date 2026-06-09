use std::time::Duration;
use rand::Rng;

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: f64,
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 5,
            initial_delay_ms: 1000,
            max_delay_ms: 60000,
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }
}

pub struct RetryState {
    pub attempt: u32,
    pub next_delay_ms: u64,
}

impl RetryState {
    pub fn new(config: &RetryConfig) -> Self {
        Self {
            attempt: 0,
            next_delay_ms: config.initial_delay_ms,
        }
    }

    pub fn should_retry(&self, config: &RetryConfig) -> bool {
        self.attempt < config.max_retries
    }

    /// Returns true if we should retry, false if max attempts reached.
    /// After calling this, await `current_delay()` before retrying.
    pub fn next_retry(&mut self, config: &RetryConfig) -> bool {
        self.attempt += 1;
        if self.attempt >= config.max_retries {
            return false;
        }
        let base_delay = (self.next_delay_ms as f64 * config.backoff_multiplier) as u64;
        let capped = base_delay.min(config.max_delay_ms);

        self.next_delay_ms = if config.jitter {
            let mut rng = rand::thread_rng();
            let jitter_factor = rng.gen_range(0.8..1.2);
            (capped as f64 * jitter_factor) as u64
        } else {
            capped
        };

        true
    }

    pub fn current_delay(&self) -> Duration {
        Duration::from_millis(self.next_delay_ms)
    }
}

pub async fn retry_with_backoff<F, Fut, T, E>(
    config: &RetryConfig,
    mut operation: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let mut state = RetryState::new(config);
    loop {
        match operation().await {
            Ok(value) => return Ok(value),
            Err(e) => {
                if !state.should_retry(config) {
                    return Err(e);
                }
                let delay = state.current_delay();
                eprintln!("Operation failed (attempt {}/{}), retrying in {:?}: {}",
                    state.attempt, config.max_retries, delay, e);
                tokio::time::sleep(delay).await;
                if !state.next_retry(config) {
                    return Err(e);
                }
            }
        }
    }
}
