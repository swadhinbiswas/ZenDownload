/// Centralized list of supported adult content sites via yt-dlp.
///
/// Each entry is the canonical site key used by yt-dlp's `--extractor-args`
/// or a host string used to detect a URL. yt-dlp supports 1700+ sites
/// including all major adult content platforms - we maintain this curated
/// list for the "Adult Sites Downloader" UI so users can pick from
/// the most popular options and search/download without typing raw URLs.
pub struct AdultSite {
    pub key: &'static str,
    pub display_name: &'static str,
    pub hosts: &'static [&'static str],
    pub search_url: &'static str,
    pub has_search: bool,
    pub icon: &'static str,
}

pub const ADULT_SITES: &[AdultSite] = &[
    AdultSite {
        key: "pornhub",
        display_name: "Pornhub",
        hosts: &["pornhub.com", "www.pornhub.com"],
        search_url: "https://www.pornhub.com/video/search?search=%s",
        has_search: true,
        icon: "PH",
    },
    AdultSite {
        key: "xhamster",
        display_name: "xHamster",
        hosts: &["xhamster.com", "xhamster2.com", "xhamster.desi", "xhamster.one"],
        search_url: "https://xhamster.com/search/%s",
        has_search: true,
        icon: "XH",
    },
    AdultSite {
        key: "xvideos",
        display_name: "XVideos",
        hosts: &["xvideos.com", "www.xvideos.com"],
        search_url: "https://www.xvideos.com/?k=%s",
        has_search: true,
        icon: "XV",
    },
    AdultSite {
        key: "redtube",
        display_name: "RedTube",
        hosts: &["redtube.com", "www.redtube.com"],
        search_url: "https://www.redtube.com/?search=%s",
        has_search: true,
        icon: "RT",
    },
    AdultSite {
        key: "youporn",
        display_name: "YouPorn",
        hosts: &["youporn.com", "www.youporn.com"],
        search_url: "https://www.youporn.com/search/?query=%s",
        has_search: true,
        icon: "YP",
    },
    AdultSite {
        key: "xnxx",
        display_name: "xnxx",
        hosts: &["xnxx.com", "www.xnxx.com"],
        search_url: "https://www.xnxx.com/search/%s",
        has_search: true,
        icon: "XN",
    },
    AdultSite {
        key: "beeg",
        display_name: "Beeg",
        hosts: &["beeg.com", "www.beeg.com"],
        search_url: "https://beeg.com/?q=%s",
        has_search: true,
        icon: "BG",
    },
    AdultSite {
        key: "eporner",
        display_name: "Eporner",
        hosts: &["eporner.com", "www.eporner.com"],
        search_url: "https://www.eporner.com/search/%s/",
        has_search: true,
        icon: "EP",
    },
    AdultSite {
        key: "spankbang",
        display_name: "SpankBang",
        hosts: &["spankbang.com", "www.spankbang.com"],
        search_url: "https://spankbang.com/s/%s/",
        has_search: true,
        icon: "SB",
    },
    AdultSite {
        key: "tnaflix",
        display_name: "TnaFlix",
        hosts: &["tnaflix.com", "www.tnaflix.com"],
        search_url: "https://www.tnaflix.com/search.php?what=%s",
        has_search: true,
        icon: "TF",
    },
    AdultSite {
        key: "hclips",
        display_name: "hClips",
        hosts: &["hclips.com", "www.hclips.com"],
        search_url: "https://www.hclips.com/search/%s/",
        has_search: true,
        icon: "HC",
    },
    AdultSite {
        key: "motherless",
        display_name: "Motherless",
        hosts: &["motherless.com", "www.motherless.com"],
        search_url: "https://motherless.com/search?term=%s",
        has_search: true,
        icon: "ML",
    },
];

/// Returns true if the given URL host belongs to a known adult content site.
pub fn is_adult_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    ADULT_SITES.iter().any(|site| {
        site.hosts.iter().any(|h| lower.contains(h))
    })
}

/// Returns the display name for an adult site matching the given URL host.
pub fn site_name_for_url(url: &str) -> Option<&'static str> {
    let lower = url.to_lowercase();
    ADULT_SITES
        .iter()
        .find(|site| site.hosts.iter().any(|h| lower.contains(h)))
        .map(|s| s.display_name)
}
