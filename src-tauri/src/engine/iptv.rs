use super::m3u::{self, M3uEntry};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// ============== Data Structures ==============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IptvChannel {
    pub id: String,
    pub name: String,
    pub url: String,
    pub logo: Option<String>,
    pub group: Option<String>,
    pub categories: Vec<CategoryInfo>,
    pub primary_category: Option<String>,
    pub primary_category_id: Option<String>,
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub flag: Option<String>,
    pub region: Option<String>,
    pub language: Option<String>,
    pub quality: Option<String>,
    pub tvg_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryInfo {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountryInfo {
    pub name: String,
    pub code: String,
    pub languages: Vec<String>,
    pub flag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogoInfo {
    pub url: String,
    pub tags: Vec<String>,
    pub format: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelBatch {
    pub batch_index: usize,
    pub total_channels: usize,
    pub channels: Vec<IptvChannel>,
    pub progress: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelSummary {
    pub total: usize,
    pub by_country: Vec<CountryGroup>,
    pub by_region: Vec<RegionGroup>,
    pub by_category: Vec<CategoryGroup>,
    pub by_language: Vec<LanguageGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountryGroup {
    pub code: String,
    pub name: String,
    pub count: usize,
    pub flag: String,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionGroup {
    pub name: String,
    pub count: usize,
    pub countries: Vec<CountryGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryGroup {
    pub id: String,
    pub name: String,
    pub count: usize,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageGroup {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataLoadStatus {
    pub logos_loaded: bool,
    pub countries_loaded: bool,
    pub categories_loaded: bool,
    pub logos_count: usize,
    pub countries_count: usize,
    pub categories_count: usize,
}

// ============== Cache ==============

#[derive(Default, Clone)]
struct IptvCache {
    channels: Option<Vec<IptvChannel>>,
    logos: HashMap<String, LogoInfo>,
    countries: HashMap<String, CountryInfo>,
    categories: HashMap<String, CategoryInfo>,
}

static CACHE: Lazy<Mutex<IptvCache>> = Lazy::new(|| Mutex::new(IptvCache::default()));

const IPTV_API_BASE: &str = "https://iptv-org.github.io/api";
const BATCH_SIZE: usize = 500;

// ============== Country/Region Logic ==============

fn extract_country_code(tvg_id: &str) -> Option<String> {
    let without_quality = if let Some(at_pos) = tvg_id.find('@') {
        &tvg_id[..at_pos]
    } else {
        tvg_id
    };

    let parts: Vec<&str> = without_quality.split('.').collect();
    if let Some(last) = parts.last() {
        let code = last.trim();
        if code.len() >= 2 && code.len() <= 3 && code.chars().all(|c| c.is_ascii_alphabetic()) {
            return Some(code.to_uppercase());
        }
    }
    None
}

fn extract_quality(tvg_id: &str) -> Option<String> {
    if let Some(at_pos) = tvg_id.find('@') {
        let q = &tvg_id[at_pos + 1..];
        let q = q.split('@').next().unwrap_or(q);
        if !q.is_empty() && q.len() <= 8 {
            return Some(q.to_uppercase());
        }
    }
    None
}

fn region_for_country(code: &str) -> &'static str {
    match code.to_uppercase().as_str() {
        "US" | "CA" | "MX" | "GT" | "BZ" | "HN" | "SV" | "NI" | "CR" | "PA" | "CU" | "DO" |
        "HT" | "JM" | "TT" | "BB" | "BS" | "PR" | "GY" | "SR" | "BS" => "Americas",
        "BR" | "AR" | "CL" | "CO" | "PE" | "UY" | "PY" | "BO" | "EC" | "VE" => "Americas",
        "GB" | "UK" | "IE" | "FR" | "DE" | "ES" | "PT" | "IT" | "NL" | "BE" | "LU" | "CH" |
        "AT" | "SE" | "NO" | "DK" | "FI" | "IS" | "PL" | "CZ" | "SK" | "RO" | "BG" | "GR" |
        "HU" | "HR" | "RS" | "BA" | "SI" | "AL" | "MK" | "ME" | "XK" | "MD" | "LT" | "LV" |
        "EE" | "MT" | "CY" | "AX" => "Europe",
        "IN" | "CN" | "HK" | "TW" | "JP" | "KR" | "TH" | "VN" | "ID" | "PH" | "MY" | "SG" |
        "PK" | "BD" | "LK" | "NP" | "MM" | "KH" | "LA" | "MN" | "KZ" | "UZ" | "KG" | "TJ" |
        "TM" | "GE" | "AM" | "AZ" | "AF" | "BT" | "MV" => "Asia",
        "IL" | "PS" | "LB" | "SY" | "JO" | "IQ" | "IR" | "SA" | "AE" | "QA" | "BH" | "KW" |
        "OM" | "YE" | "TR" => "MENA",
        "EG" | "LY" | "TN" | "DZ" | "MA" | "SD" | "ET" | "KE" | "TZ" | "UG" | "NG" | "GH" |
        "SN" | "CI" | "CM" | "ZA" | "ZW" | "AO" | "MZ" | "RW" | "BI" | "MW" | "ZM" => "Africa",
        "AU" | "NZ" | "FJ" | "PG" | "WS" | "TO" => "Oceania",
        _ => "Other",
    }
}

fn extract_language_from_codes(lang_codes: &[String], countries: &HashMap<String, CountryInfo>) -> Option<String> {
    use super::m3u::LANG_MAP; // we'll add a public map in m3u.rs
    for code in lang_codes {
        if let Some(name) = LANG_MAP.get(code.as_str()) {
            return Some(name.to_string());
        }
    }
    None
}

fn parse_categories(group: Option<&str>) -> Vec<String> {
    match group {
        Some(g) => g.split(';').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect(),
        None => Vec::new(),
    }
}

// ============== JSON Loaders ==============

#[derive(Debug, Clone, Deserialize)]
struct IptvOrgLogo {
    channel: String,
    feed: Option<String>,
    in_use: bool,
    tags: Vec<String>,
    width: Option<u32>,
    height: Option<u32>,
    format: Option<String>,
    url: String,
}

#[derive(Debug, Deserialize)]
struct IptvOrgCategory {
    id: String,
    name: String,
    description: String,
}

async fn load_logos() -> Result<usize, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let logos: Vec<IptvOrgLogo> = client
        .get(format!("{}/logos.json", IPTV_API_BASE))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch logos: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse logos: {}", e))?;

    let mut cache = CACHE.lock().unwrap();
    // For each channel, pick the BEST logo:
    // 1. Prefer tags: ["color", "horizontal"] (or just "color")
    // 2. Higher resolution preferred
    // 3. Skip if in_use is false
    let mut best_logos: HashMap<String, IptvOrgLogo> = HashMap::new();
    for logo in logos.iter().filter(|l| l.in_use).cloned() {
        let entry = best_logos.entry(logo.channel.clone()).or_insert_with(|| logo.clone());
        let entry_score = score_logo(entry);
        let new_score = score_logo(&logo);
        if new_score > entry_score {
            *entry = logo;
        }
    }

    let count = best_logos.len();
    for (channel, logo) in best_logos {
        cache.logos.insert(channel, LogoInfo {
            url: logo.url,
            tags: logo.tags,
            format: logo.format,
            width: logo.width,
            height: logo.height,
        });
    }
    Ok(count)
}

fn score_logo(logo: &IptvOrgLogo) -> i32 {
    let mut score = 0;
    let tags: Vec<&str> = logo.tags.iter().map(|s| s.as_str()).collect();

    // Tag preferences
    if tags.contains(&"color") { score += 100; }
    if tags.contains(&"colored") { score += 80; }
    if tags.contains(&"horizontal") { score += 50; }
    if tags.contains(&"square") { score += 30; }
    if tags.contains(&"white") { score += 10; }
    if tags.contains(&"black") { score += 5; }
    if tags.contains(&"dark") { score += 5; }
    // Penalize transparent-only
    if tags.contains(&"transparent") && !tags.contains(&"color") { score -= 20; }

    // Resolution: prefer bigger (PNG/WEBP/SVG) - up to 100 points
    if let (Some(w), Some(h)) = (logo.width, logo.height) {
        let area = (w as i32) * (h as i32);
        if area > 0 {
            // log-scaled resolution score
            let res_score = ((area as f64).log10() as i32).min(100);
            score += res_score;
        }
    }

    // Format preference: SVG > PNG/WEBP > JPEG > GIF
    match logo.format.as_deref() {
        Some("SVG") => score += 30,
        Some("PNG") | Some("WebP") | Some("APNG") | Some("AVIF") => score += 20,
        Some("JPEG") => score += 10,
        Some("GIF") => score += 5,
        _ => {}
    }

    score
}

async fn load_countries() -> Result<usize, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let countries: Vec<CountryInfo> = client
        .get(format!("{}/countries.json", IPTV_API_BASE))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch countries: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse countries: {}", e))?;

    let mut cache = CACHE.lock().unwrap();
    let count = countries.len();
    for c in countries {
        cache.countries.insert(c.code.clone(), c);
    }
    Ok(count)
}

async fn load_categories() -> Result<usize, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let categories: Vec<IptvOrgCategory> = client
        .get(format!("{}/categories.json", IPTV_API_BASE))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch categories: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse categories: {}", e))?;

    let mut cache = CACHE.lock().unwrap();
    let count = categories.len();
    for c in categories {
        cache.categories.insert(c.id.clone(), CategoryInfo {
            id: c.id,
            name: c.name,
            description: c.description,
        });
    }
    Ok(count)
}

// ============== Channel Enrichment ==============

fn entry_to_channel(idx: usize, e: &M3uEntry, cache: &IptvCache) -> IptvChannel {
    let tvg_id = e.tvg_id.clone().unwrap_or_default();
    let tvg_id_opt = if tvg_id.is_empty() { None } else { Some(tvg_id.clone()) };

    // Look up country from cache (authoritative), fall back to tvg-id extraction
    let country_code = tvg_id_opt.as_ref()
        .and_then(|id| extract_country_code(id))
        .or_else(|| {
            // Try to find in country cache by partial match
            cache.countries.values()
                .find(|_| false) // placeholder, tvg-id is already used
                .map(|c| c.code.clone())
        });

    let country_info = country_code.as_ref().and_then(|c| cache.countries.get(c));
    let country = country_info.map(|c| c.name.clone());
    let flag = country_info.map(|c| c.flag.clone());
    let region = country_code.as_ref().map(|c| region_for_country(c).to_string());

    let quality = extract_quality(&tvg_id);

    // Resolve categories: from M3U group, look up in cache for descriptions
    let category_ids = parse_categories(e.group.as_deref());
    let categories: Vec<CategoryInfo> = category_ids.iter()
        .filter_map(|id| cache.categories.get(id).cloned())
        .collect();
    let primary_category_id = category_ids.first().cloned();
    let primary_category = categories.first().map(|c| c.name.clone());

    // Pick best logo: cache (curated) > M3U tvg-logo
    let logo = tvg_id_opt.as_ref()
        .and_then(|id| cache.logos.get(id).map(|l| l.url.clone()))
        .or_else(|| e.logo.clone());

    // Language from country info
    let language = country_info.and_then(|c| {
        extract_language_from_codes(&c.languages, &cache.countries)
    });

    IptvChannel {
        id: format!("ch_{}", idx),
        name: e.name.clone(),
        url: e.url.clone(),
        logo,
        group: e.group.clone(),
        categories,
        primary_category,
        primary_category_id,
        country,
        country_code,
        flag,
        region,
        language,
        quality,
        tvg_id: tvg_id_opt,
    }
}

pub fn m3u_entries_to_channels(entries: &[M3uEntry]) -> Vec<IptvChannel> {
    let cache = CACHE.lock().unwrap();
    entries.iter().enumerate().map(|(i, e)| entry_to_channel(i, e, &cache)).collect()
}

// ============== Summary Builder ==============

pub fn build_summary(channels: &[IptvChannel]) -> ChannelSummary {
    let mut country_map: HashMap<String, (String, usize, String, Option<String>)> = HashMap::new();
    let mut category_map: HashMap<String, (String, usize)> = HashMap::new();
    let mut language_map: HashMap<String, usize> = HashMap::new();

    for c in channels {
        if let (Some(code), Some(name), Some(flag)) = (&c.country_code, &c.country, &c.flag) {
            let entry = country_map.entry(code.clone()).or_insert((name.clone(), 0, flag.clone(), c.region.clone()));
            entry.1 += 1;
        }
        if let Some(cat) = &c.primary_category {
            *category_map.entry(cat.clone()).or_insert((String::new(), 0)) = (
                c.primary_category_id.clone().unwrap_or_default(),
                category_map.get(cat).map(|x| x.1 + 1).unwrap_or(1)
            );
        }
        if let Some(lang) = &c.language {
            *language_map.entry(lang.clone()).or_insert(0) += 1;
        }
    }

    let by_country: Vec<CountryGroup> = country_map
        .into_iter()
        .map(|(code, (name, count, flag, region))| CountryGroup { code, name, count, flag, region })
        .collect();

    // Group by region
    let mut region_map: HashMap<String, Vec<CountryGroup>> = HashMap::new();
    for cg in &by_country {
        let region = cg.region.clone().unwrap_or_else(|| "Other".to_string());
        region_map.entry(region).or_default().push(cg.clone());
    }
    let mut by_region: Vec<RegionGroup> = region_map
        .into_iter()
        .map(|(name, countries)| {
            let count = countries.iter().map(|c| c.count).sum();
            let mut countries = countries;
            countries.sort_by(|a, b| b.count.cmp(&a.count));
            RegionGroup { name, count, countries }
        })
        .collect();
    by_region.sort_by(|a, b| b.count.cmp(&a.count));

    let mut by_country = by_country;
    by_country.sort_by(|a, b| b.count.cmp(&a.count));

    // Build category groups with descriptions from cache
    let cache = CACHE.lock().unwrap();
    let mut by_category: Vec<CategoryGroup> = category_map
        .into_iter()
        .map(|(name, (id, count))| {
            let description = cache.categories.get(&id).map(|c| c.description.clone()).unwrap_or_default();
            CategoryGroup { id, name, count, description }
        })
        .collect();
    by_category.sort_by(|a, b| b.count.cmp(&a.count));
    drop(cache);

    let mut by_language: Vec<LanguageGroup> = language_map
        .into_iter()
        .map(|(name, count)| LanguageGroup { name, count })
        .collect();
    by_language.sort_by(|a, b| b.count.cmp(&a.count));

    ChannelSummary {
        total: channels.len(),
        by_country,
        by_region,
        by_category,
        by_language,
    }
}

// ============== Main Loading ==============

pub async fn fetch_iptv_channels_chunked(
    app: &AppHandle,
    url: &str,
) -> Result<usize, String> {
    use futures::StreamExt;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    // Step 1: Fetch metadata JSONs in parallel (small files)
    let logos_fut = load_logos();
    let countries_fut = load_countries();
    let categories_fut = load_categories();

    // Run metadata loads in parallel and emit progress
    let (logos_res, countries_res, categories_res) = tokio::join!(
        logos_fut, countries_fut, categories_fut
    );

    let logos_count = logos_res.unwrap_or_else(|e| { eprintln!("Logos load: {}", e); 0 });
    let countries_count = countries_res.unwrap_or_else(|e| { eprintln!("Countries load: {}", e); 0 });
    let categories_count = categories_res.unwrap_or_else(|e| { eprintln!("Categories load: {}", e); 0 });

    let status = MetadataLoadStatus {
        logos_loaded: logos_count > 0,
        countries_loaded: countries_count > 0,
        categories_loaded: categories_count > 0,
        logos_count,
        countries_count,
        categories_count,
    };
    let _ = app.emit("iptv-metadata-status", &status);

    // Step 2: Stream the M3U playlist
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch IPTV playlist: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {} when fetching IPTV playlist", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = Vec::with_capacity(2 * 1024 * 1024);
    let mut total_bytes: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Stream error: {}", e))?;
        buffer.extend_from_slice(&chunk);
        total_bytes += chunk.len() as u64;

        if last_emit.elapsed().as_millis() > 250 {
            let _ = app.emit("iptv-download-progress", serde_json::json!({
                "bytes": total_bytes,
            }));
            last_emit = std::time::Instant::now();
        }
    }

    let _ = app.emit("iptv-download-progress", serde_json::json!({
        "bytes": total_bytes,
        "done": true,
    }));

    // Step 3: Parse M3U + enrich with metadata
    let content = String::from_utf8_lossy(&buffer);
    let entries = m3u::parse_m3u(&content);
    drop(content);
    drop(buffer);

    let total = entries.len();
    let channels = m3u_entries_to_channels(&entries);
    drop(entries);

    {
        let mut cache = CACHE.lock().unwrap();
        cache.channels = Some(channels.clone());
    }

    // Step 4: Emit in batches
    let mut batch_index = 0;
    for chunk in channels.chunks(BATCH_SIZE) {
        let batch = ChannelBatch {
            batch_index,
            total_channels: total,
            channels: chunk.to_vec(),
            progress: (batch_index * BATCH_SIZE + chunk.len()) as f32 / total.max(1) as f32,
        };
        let _ = app.emit("iptv-batch", &batch);
        batch_index += 1;
        tokio::task::yield_now().await;
    }

    // Step 5: Emit summary
    let summary = build_summary(&channels);
    let _ = app.emit("iptv-summary", &summary);

    Ok(total)
}

pub async fn fetch_iptv_channels(url: &str) -> Result<Vec<IptvChannel>, String> {
    {
        let cache = CACHE.lock().unwrap();
        if let Some(c) = cache.channels.as_ref() {
            return Ok(c.clone());
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let content = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch IPTV playlist: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read IPTV playlist: {}", e))?;

    let entries = m3u::parse_m3u(&content);
    let channels = m3u_entries_to_channels(&entries);

    {
        let mut cache = CACHE.lock().unwrap();
        cache.channels = Some(channels.clone());
    }

    Ok(channels)
}

pub fn get_cached_channels() -> Option<Vec<IptvChannel>> {
    CACHE.lock().unwrap().channels.clone()
}

pub fn get_cached_summary() -> Option<ChannelSummary> {
    CACHE.lock().unwrap().channels.as_ref().map(|c| build_summary(c))
}

pub fn clear_cache() {
    let mut cache = CACHE.lock().unwrap();
    cache.channels = None;
    cache.logos.clear();
    cache.countries.clear();
    cache.categories.clear();
}
