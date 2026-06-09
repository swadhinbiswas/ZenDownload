use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadType {
    Http,           // http:// https://
    Ftp,            // ftp:// ftps://
    Sftp,           // sftp://
    Scp,            // scp://
    WebDav,         // webdav:// webdavs:// or PROPFIND-capable HTTPS
    Smb,            // smb:// cifs://
    Nfs,            // nfs://
    Torrent,        // .torrent file path or URL ending in .torrent
    Magnet,         // magnet:?xt=urn:btih:
    Ed2k,           // ed2k://
    Ipfs,           // ipfs:// /ipfs/ /ipns/
    Rtmp,           // rtmp:// rtmps://
    Rtsp,           // rtsp:// rtp://
    Mms,            // mms://
    Srt,            // srt://
    Hls,            // URL containing .m3u8
    Dash,           // URL containing .mpd
    Nzb,            // .nzb file path or URL ending in .nzb
    Mega,           // mega.nz mega://
    GoogleDrive,    // drive.google.com
    OneDrive,       // 1drv.ms sharepoint.com
    Dropbox,        // dropbox.com/s/
    Box,            // app.box.com
    PCloud,         // pcloud.com
    Stream,         // any other URL, probe with yt-dlp
    Unknown,        // cannot determine, ask user
}

pub fn classify_url(input_url: &str) -> DownloadType {
    // 1. Check early string patterns (Magnets, ED2K)
    if input_url.starts_with("magnet:?xt=urn:btih:") {
        return DownloadType::Magnet;
    }
    if input_url.starts_with("ed2k://") {
        return DownloadType::Ed2k;
    }
    if input_url.starts_with("ipfs://") || input_url.starts_with("/ipfs/") || input_url.starts_with("/ipns/") {
        return DownloadType::Ipfs;
    }

    // 2. Parse URL via standard libraries
    let parsed_url = match Url::parse(input_url) {
        Ok(u) => u,
        Err(_) => {
            // Check if it's a local .torrent or .nzb file path instead of URL
            if input_url.ends_with(".torrent") {
                return DownloadType::Torrent;
            }
            if input_url.ends_with(".nzb") {
                return DownloadType::Nzb;
            }
            return DownloadType::Unknown;
        }
    };

    // 3. Scheme matching
    match parsed_url.scheme() {
        "ftp" | "ftps" => return DownloadType::Ftp,
        "sftp" => return DownloadType::Sftp,
        "scp" => return DownloadType::Scp,
        "smb" | "cifs" => return DownloadType::Smb,
        "nfs" => return DownloadType::Nfs,
        "webdav" | "webdavs" => return DownloadType::WebDav,
        "rtmp" | "rtmps" => return DownloadType::Rtmp,
        "rtsp" | "rtp" => return DownloadType::Rtsp,
        "mms" => return DownloadType::Mms,
        "srt" => return DownloadType::Srt,
        _ => {}
    }

    // 4. File Extension matching
    let path = parsed_url.path();
    if path.ends_with(".torrent") {
        return DownloadType::Torrent;
    }
    if path.ends_with(".nzb") {
        return DownloadType::Nzb;
    }
    if path.ends_with(".m3u8") {
        return DownloadType::Hls;
    }
    if path.ends_with(".mpd") {
        return DownloadType::Dash;
    }

    // 5. Cloud Service Domains
    if let Some(host) = parsed_url.host_str() {
        if host.contains("mega.nz") || parsed_url.scheme() == "mega" {
            return DownloadType::Mega;
        }
        if host.contains("drive.google.com") {
            return DownloadType::GoogleDrive;
        }
        if host.contains("1drv.ms") || host.contains("sharepoint.com") {
            return DownloadType::OneDrive;
        }
        if host.contains("dropbox.com") {
            return DownloadType::Dropbox;
        }
        if host.contains("app.box.com") {
            return DownloadType::Box;
        }
        if host.contains("pcloud.com") {
            return DownloadType::PCloud;
        }
        if host.contains("youtube.com") || host.contains("youtu.be") || host.contains("vimeo.com") {
            return DownloadType::Stream;
        }
    }

    // 6. Generic Fallbacks
    match parsed_url.scheme() {
        "http" | "https" => DownloadType::Http,
        _ => DownloadType::Unknown,
    }
}
