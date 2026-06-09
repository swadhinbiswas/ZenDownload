use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecksumResult {
    pub sha256: String,
    pub md5: String,
    pub size: u64,
}

pub async fn compute_checksums(file_path: &str) -> Result<ChecksumResult, String> {
    use sha2::{Sha256, Digest};
    use md5::Md5;

    let data = tokio::fs::read(file_path).await
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let size = data.len() as u64;

    let mut sha256 = Sha256::new();
    sha256.update(&data);
    let sha256_hex = format!("{:x}", sha256.finalize());

    let mut md5 = Md5::new();
    md5.update(&data);
    let md5_hex = format!("{:x}", md5.finalize());

    Ok(ChecksumResult {
        sha256: sha256_hex,
        md5: md5_hex,
        size,
    })
}

pub async fn verify_checksum(file_path: &str, expected_sha256: &str) -> Result<bool, String> {
    use sha2::{Sha256, Digest};

    let data = tokio::fs::read(file_path).await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(&data);
    let actual = format!("{:x}", hasher.finalize());

    Ok(actual.eq_ignore_ascii_case(expected_sha256))
}

pub fn hash_string(input: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}
