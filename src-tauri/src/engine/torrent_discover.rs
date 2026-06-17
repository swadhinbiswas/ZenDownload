use serde::{Deserialize, Serialize};
use reqwest::blocking::Client;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendingTorrent {
    pub title: String,
    pub magnet: String,
    pub seeders: i64,
    pub leechers: i64,
    pub size: String,
    pub source: String,
    pub category: Option<String>,
}

fn client() -> Client {
    Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(10))
        .build().unwrap_or_default()
}

fn fmt_size(b: u64) -> String {
    if b == 0 { return "?".into() }
    let u = ["B","KB","MB","GB","TB"];
    let i = ((b.ilog2().min(50))/10) as usize;
    let i = i.min(u.len()-1);
    format!("{:.1}{}", b as f64 / (1u64<<(i*10)) as f64, u[i])
}

/// TPB — search popular queries to build trending list
fn fetch_tpb_trending() -> Vec<TrendingTorrent> {
    let c = client();
    let queries = ["2160p", "1080p x265", "1080p x264", "2024 1080p", "bluray 1080p"];
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();

    for q in &queries {
        let url = format!("https://apibay.org/q.php?q={}&cat=", urlencoding::encode(q));
        let Ok(body) = c.get(&url).send().and_then(|r| r.text()) else { continue };
        let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&body) else { continue };
        for item in items.iter().take(15) {
            let name = item["name"].as_str().unwrap_or("");
            let hash = item["info_hash"].as_str().unwrap_or("");
            if name.is_empty() || hash.is_empty() || seen.contains(hash) { continue }
            seen.insert(hash.to_string());
            let seeds: i64 = item["seeders"].as_str().unwrap_or("0").parse().unwrap_or(0);
            let leech: i64 = item["leechers"].as_str().unwrap_or("0").parse().unwrap_or(0);
            let size_b: u64 = item["size"].as_str().unwrap_or("0").parse().unwrap_or(0);
            if seeds < 20 { continue }
            out.push(TrendingTorrent {
                title: name.into(),
                magnet: format!("magnet:?xt=urn:btih:{}&dn={}", hash, urlencoding::encode(name)),
                seeders: seeds, leechers: leech, size: fmt_size(size_b),
                source: "TPB".into(), category: None,
            });
        }
    }
    out.sort_by(|a,b| b.seeders.cmp(&a.seeders));
    out.truncate(30);
    out
}

/// YTS — latest movies with high seeds
fn fetch_yts_trending() -> Vec<TrendingTorrent> {
    let c = client();
    let Ok(body) = c.get("https://yts.mx/api/v2/list_movies.json?sort_by=download_count&limit=30&minimum_rating=5")
        .send().and_then(|r| r.text()) else { return vec![] };
    let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) else { return vec![] };
    let mut out = vec![];
    if let Some(movies) = data["data"]["movies"].as_array() {
        for m in movies {
            let t = format!("{} ({})", m["title"].as_str().unwrap_or(""), m["year"].as_i64().unwrap_or(0));
            for tor in m["torrents"].as_array().unwrap_or(&vec![]) {
                let q = tor["quality"].as_str().unwrap_or(""); let h = tor["hash"].as_str().unwrap_or("");
                if h.is_empty() { continue }
                out.push(TrendingTorrent {
                    title: format!("{} [{}]", t, q),
                    magnet: format!("magnet:?xt=urn:btih:{}&dn={}", h, urlencoding::encode(&t)),
                    seeders: tor["seeds"].as_i64().unwrap_or(0),
                    leechers: tor["peers"].as_i64().unwrap_or(0),
                    size: tor["size"].as_str().unwrap_or("").into(),
                    source: "YTS".into(), category: Some("Movies".into()),
                });
            }
        }
    }
    out.truncate(25);
    out
}

/// Aggregate trending
pub async fn fetch_trending() -> Vec<TrendingTorrent> {
    let (tpb, yts) = tokio::task::spawn_blocking(move || {
        (fetch_tpb_trending(), fetch_yts_trending())
    }).await.unwrap_or_default();

    let mut all: Vec<TrendingTorrent> = tpb.into_iter().chain(yts).collect();
    all.sort_by(|a,b| b.seeders.cmp(&a.seeders));
    all.dedup_by(|a,b| a.title == b.title);
    all.truncate(50);
    all
}
