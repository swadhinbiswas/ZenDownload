use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VtReport {
    pub file_hash: String,
    pub malicious: u32,
    pub suspicious: u32,
    pub undetected: u32,
    pub harmless: u32,
    pub timeout: u32,
    pub confirmed_timeout: u32,
    pub failure: u32,
    pub type_unsupported: u32,
    pub last_analysis_date: Option<i64>,
    pub permalink: Option<String>,
    pub reputation: Option<i32>,
    pub categories: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VtError {
    pub code: String,
    pub message: String,
}

pub async fn check_hash(api_key: &str, file_hash: &str) -> Result<VtReport, String> {
    if api_key.is_empty() {
        return Err("VirusTotal API key is empty. Set it in Settings > Security.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://www.virustotal.com/api/v3/files/{}", file_hash);
    let response = client.get(&url)
        .header("x-apikey", api_key)
        .send().await
        .map_err(|e| format!("VirusTotal request failed: {}", e))?;

    if response.status() == 404 {
        return Ok(VtReport {
            file_hash: file_hash.to_string(),
            malicious: 0, suspicious: 0, undetected: 0, harmless: 0,
            timeout: 0, confirmed_timeout: 0, failure: 0, type_unsupported: 0,
            last_analysis_date: None,
            permalink: None,
            reputation: None,
            categories: std::collections::HashMap::new(),
        });
    }

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("VirusTotal API error ({}): {}", status, text));
    }

    let body: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse VirusTotal response: {}", e))?;

    let attrs = &body["data"]["attributes"];
    let stats = &attrs["last_analysis_stats"];

    let report = VtReport {
        file_hash: file_hash.to_string(),
        malicious: stats["malicious"].as_u64().unwrap_or(0) as u32,
        suspicious: stats["suspicious"].as_u64().unwrap_or(0) as u32,
        undetected: stats["undetected"].as_u64().unwrap_or(0) as u32,
        harmless: stats["harmless"].as_u64().unwrap_or(0) as u32,
        timeout: stats["timeout"].as_u64().unwrap_or(0) as u32,
        confirmed_timeout: stats["confirmed-timeout"].as_u64().unwrap_or(0) as u32,
        failure: stats["failure"].as_u64().unwrap_or(0) as u32,
        type_unsupported: stats["type-unsupported"].as_u64().unwrap_or(0) as u32,
        last_analysis_date: attrs["last_analysis_date"].as_i64(),
        permalink: attrs["permalink"].as_str().map(String::from),
        reputation: attrs["reputation"].as_i64().map(|i| i as i32),
        categories: attrs["categories"].as_object()
            .map(|o| o.iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string())).collect())
            .unwrap_or_default(),
    };

    Ok(report)
}

pub fn is_threat(report: &VtReport, threshold: u32) -> bool {
    report.malicious >= threshold || report.suspicious >= threshold
}

pub async fn submit_hash_for_scan(api_key: &str, file_hash: &str) -> Result<String, String> {
    if api_key.is_empty() {
        return Err("VirusTotal API key required".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://www.virustotal.com/api/v3/files/{}/analyse", file_hash);
    let response = client.post(&url)
        .header("x-apikey", api_key)
        .send().await
        .map_err(|e| format!("Failed to submit: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("VT submit error: {}", response.status()));
    }
    Ok("submitted".to_string())
}
