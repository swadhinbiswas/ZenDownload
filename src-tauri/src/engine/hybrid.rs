use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone)]
pub struct Chunk {
    pub index: usize,
    pub start_byte: i64,
    pub end_byte: i64,
    pub status: ChunkStatus,
    pub source: Option<String>,
    pub retry_count: u32,
    pub adaptive_size: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChunkStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
}

pub struct ChunkCoordinator {
    pub download_id: String,
    pub total_size: i64,
    pub chunk_size: i64,
    pub sequential: bool,
    pub chunks: Arc<Mutex<Vec<Chunk>>>,
    pub max_threads: usize,
    pub adaptive_enabled: bool,
}

impl ChunkCoordinator {
    pub fn new(download_id: String, total_size: i64, chunk_size: i64, sequential: bool) -> Self {
        let num_chunks = (total_size as f64 / chunk_size as f64).ceil() as usize;
        let mut chunks = Vec::with_capacity(num_chunks);

        for i in 0..num_chunks {
            let start = i as i64 * chunk_size;
            let mut end = start + chunk_size - 1;
            if end >= total_size {
                end = total_size - 1;
            }

            chunks.push(Chunk {
                index: i,
                start_byte: start,
                end_byte: end,
                status: ChunkStatus::Pending,
                source: None,
                retry_count: 0,
                adaptive_size: end - start + 1,
            });
        }

        Self {
            download_id,
            total_size,
            chunk_size,
            sequential,
            chunks: Arc::new(Mutex::new(chunks)),
            max_threads: 64,
            adaptive_enabled: true,
        }
    }

    pub fn new_with_threads(
        download_id: String,
        total_size: i64,
        chunk_size: i64,
        sequential: bool,
        max_threads: usize,
    ) -> Self {
        let mut coordinator = Self::new(download_id, total_size, chunk_size, sequential);
        coordinator.max_threads = max_threads;
        coordinator
    }

    /// Compute optimal initial chunk size based on file size and target chunk count.
    /// For a 4 GB file with 64 threads, target ~1024 chunks -> ~4 MB chunks.
    /// For a 100 MB file, use 256 KB chunks.
    pub fn optimal_chunk_size(total_size: i64, target_chunks: usize) -> i64 {
        let min_chunk = 128 * 1024;       // 128 KB floor
        let max_chunk = 16 * 1024 * 1024; // 16 MB ceiling
        let raw = (total_size as f64 / target_chunks as f64).ceil() as i64;
        raw.max(min_chunk).min(max_chunk)
    }

    /// Adaptively split a slow/failed chunk into smaller pieces.
    /// Returns the indices of the new sub-chunks if splitting occurred.
    pub async fn adaptively_split_chunk(&self, index: usize, split_factor: usize) -> Option<Vec<usize>> {
        let mut lock = self.chunks.lock().await;
        let chunk_status = lock.get(index)?.status.clone();
        if chunk_status == ChunkStatus::Completed {
            return None;
        }

        let chunk_size = lock[index].end_byte - lock[index].start_byte + 1;
        if chunk_size < 256 * 1024 {
            return None;
        }

        let start = lock[index].start_byte;
        let end = lock[index].end_byte;
        let sub_size = chunk_size / split_factor as i64;

        let mut new_indices = Vec::new();
        for s in 0..split_factor {
            let sub_start = start + s as i64 * sub_size;
            let mut sub_end = sub_start + sub_size - 1;
            if s == split_factor - 1 {
                sub_end = end;
            }

            let new_index = lock.len();
            lock.push(Chunk {
                index: new_index,
                start_byte: sub_start,
                end_byte: sub_end,
                status: ChunkStatus::Pending,
                source: None,
                retry_count: 0,
                adaptive_size: sub_end - sub_start + 1,
            });
            new_indices.push(new_index);
        }

        lock[index].status = ChunkStatus::Completed;
        Some(new_indices)
    }

    /// Get the next pending chunk. Simplified: just pick the first pending chunk.
    /// With 4MB chunks, lock contention is negligible — this is O(1) and fast.
    pub async fn get_next_pending_chunk(&self, source_name: &str) -> Option<Chunk> {
        let mut lock = self.chunks.lock().await;

        for chunk in lock.iter_mut() {
            if chunk.status == ChunkStatus::Pending {
                chunk.status = ChunkStatus::Downloading;
                chunk.source = Some(source_name.to_string());
                return Some(chunk.clone());
            }
        }
        None
    }

    pub async fn mark_chunk_completed(&self, index: usize) {
        let mut lock = self.chunks.lock().await;
        if let Some(chunk) = lock.get_mut(index) {
            chunk.status = ChunkStatus::Completed;
        }
    }

    pub async fn mark_chunk_failed(&self, index: usize) {
        let mut lock = self.chunks.lock().await;
        if let Some(chunk) = lock.get_mut(index) {
            chunk.status = ChunkStatus::Failed;
            chunk.source = None;
            chunk.retry_count += 1;
        }
    }

    pub async fn reset_chunk_for_retry(&self, index: usize) {
        let mut lock = self.chunks.lock().await;
        if let Some(chunk) = lock.get_mut(index) {
            if chunk.status == ChunkStatus::Failed && chunk.retry_count < 5 {
                chunk.status = ChunkStatus::Pending;
            }
        }
    }

    pub async fn is_fully_completed(&self) -> bool {
        let lock = self.chunks.lock().await;
        lock.iter().all(|c| c.status == ChunkStatus::Completed)
    }

    pub async fn total_downloaded(&self) -> i64 {
        let lock = self.chunks.lock().await;
        lock.iter()
            .filter(|c| c.status == ChunkStatus::Completed)
            .map(|c| c.end_byte - c.start_byte + 1)
            .sum()
    }

    pub async fn stats(&self) -> CoordinatorStats {
        let lock = self.chunks.lock().await;
        let mut stats = CoordinatorStats::default();
        for chunk in lock.iter() {
            match chunk.status {
                ChunkStatus::Pending => stats.pending += 1,
                ChunkStatus::Downloading => stats.downloading += 1,
                ChunkStatus::Completed => stats.completed += 1,
                ChunkStatus::Failed => stats.failed += 1,
            }
            stats.total_chunks += 1;
        }
        stats.total_bytes = self.total_size;
        stats.downloaded_bytes = lock.iter()
            .filter(|c| c.status == ChunkStatus::Completed)
            .map(|c| c.end_byte - c.start_byte + 1)
            .sum();
        stats
    }

    pub async fn get_failed_chunks(&self) -> Vec<Chunk> {
        let lock = self.chunks.lock().await;
        lock.iter()
            .filter(|c| c.status == ChunkStatus::Failed)
            .cloned()
            .collect()
    }
}

#[derive(Debug, Default, Clone)]
pub struct CoordinatorStats {
    pub total_chunks: usize,
    pub pending: usize,
    pub downloading: usize,
    pub completed: usize,
    pub failed: usize,
    pub total_bytes: i64,
    pub downloaded_bytes: i64,
}
