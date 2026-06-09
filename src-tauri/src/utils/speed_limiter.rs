use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;

pub struct TokenBucket {
    capacity: usize,
    tokens: usize,
    refill_rate: usize, // Tokens (bytes) per millisecond
    last_refill: Instant,
}

impl TokenBucket {
    pub fn new(capacity: usize, refill_rate_bytes_per_sec: usize) -> Self {
        // Refill rate mapped to per-millisecond for smoother processing
        let refill_rate = (refill_rate_bytes_per_sec / 1000).max(1);
        Self {
            capacity,
            tokens: capacity,
            refill_rate,
            last_refill: Instant::now(),
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed_ms = now.duration_since(self.last_refill).as_millis() as usize;
        
        if elapsed_ms > 0 {
            let new_tokens = elapsed_ms * self.refill_rate;
            self.tokens = std::cmp::min(self.capacity, self.tokens + new_tokens);
            self.last_refill = now;
        }
    }

    pub async fn acquire(bucket: Arc<Mutex<Self>>, mut amount: usize) {
        loop {
            let mut b = bucket.lock().await;
            b.refill();

            if b.tokens >= amount {
                b.tokens -= amount;
                return;
            }

            let available = b.tokens;
            b.tokens = 0;
            amount -= available;
            
            // Drop lock before sleeping
            drop(b);
            
            // Wait 10ms and try to acquire the rest
            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        }
    }
}
