const ZENDOWNLOAD_API = 'http://localhost:9527';
const NATIVE_HOST = 'com.zendownload.host';
const MEDIA_TRACKER_MAX_AGE = 30 * 60 * 1000;

const mediaTracker = new Map();
let nativePort = null;

// === Notification Deduplication ===
const NOTIFICATION_DEBOUNCE_MS = 3000;
let pendingNotifications = [];
let notificationTimer = null;
let notificationId = 0;

// === URL Deduplication ===
// Prevents sending the same URL multiple times (e.g., on Chrome startup).
const recentlySentUrls = new Map(); // url -> timestamp
const URL_DEDUP_TTL = 10 * 60 * 1000; // 10 minutes

function isDuplicateUrl(url) {
  const now = Date.now();
  const lastSent = recentlySentUrls.get(url);
  if (lastSent && (now - lastSent) < URL_DEDUP_TTL) return true;
  recentlySentUrls.set(url, now);
  // Cleanup old entries
  if (recentlySentUrls.size > 500) {
    for (const [key, ts] of recentlySentUrls) {
      if (now - ts > URL_DEDUP_TTL) recentlySentUrls.delete(key);
    }
  }
  return false;
}

// === URL Classification ===
// No host list needed. Direct files have recognizable extensions.
// Everything else -> yt-dlp (the engine probes with HEAD to decide http vs ytdlp).
const DIRECT_EXTS = [
  'zip','rar','7z','tar','gz','bz2','xz','exe','msi','apk','dmg','iso','img',
  'deb','rpm','pkg','pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md',
  'epub','mobi','azw3','mp4','mkv','avi','webm','mov','flv','wmv','3gp','m4v',
  'ts','m2ts','mp3','wav','flac','aac','ogg','m4a','opus','wma','torrent',
  'jpg','jpeg','png','gif','svg','webp','bmp',
];

function classifyURL(url) {
  try {
    const u = new URL(url);
    const ext = u.pathname.split('.').pop()?.toLowerCase() || '';
    if (DIRECT_EXTS.includes(ext)) return 'direct';
    if (url.startsWith('magnet:')) return 'torrent';
    return 'ytdlp';
  } catch {
    return 'ytdlp';
  }
}

// Known CDN hosts for media tracking
const MEDIA_CDN_HOSTS = [
  'video.twimg.com', 'pbs.twimg.com', 'media.twimg.com',
  'video-fks', 'fna.twimg.com',
  'scontent-', 'fbcdn.net', 'cdninstagram.com',
  'tiktokcdn.com', 'bytecdn.vn', 'v16m.tiktokcdn.com',
  'cloudfront.net', 'amazonaws.com', 'akamaihd.net', 'fastly.net',
  'streaming.media', 'cdn.video', 'cdn.flowplayer', 'vimeocdn.com',
  'cdn.discordapp.com', 'cdn.redd.it', 'redditmedia.com', 'imgur.com',
  'cdn.jwplayer.com', 'v.redd.it', 'preview.redd.it',
  'vod.', 'storage.googleapis.com',
];

function buildZendownUrl({ url, pageUrl, title, cookies, threads, formatId, category, userAgent }) {
  const params = new URLSearchParams();
  params.set('url', url || '');
  if (pageUrl) params.set('page', pageUrl);
  if (title) params.set('title', title);
  if (cookies) params.set('cookies', cookies);
  if (threads) params.set('threads', String(threads));
  if (formatId) params.set('format', formatId);
  if (category) params.set('category', category);
  if (userAgent) params.set('ua', userAgent);
  return `zendown://add?${params.toString()}`;
}

function openZendown(url) {
  // Try to open the zendown:// protocol — this will launch the desktop app
  // if it's installed and the protocol handler is registered.
  try {
    // In service worker context, use chrome.tabs.create
    chrome.tabs.create({ url, active: false }, (tab) => {
      setTimeout(() => {
        chrome.tabs.remove(tab.id).catch(() => {});
      }, 800);
    });
    return true;
  } catch {
    return false;
  }
}

function isMediaCDN(url) {
  try {
    const u = new URL(url);
    return MEDIA_CDN_HOSTS.some(h => u.hostname.includes(h));
  } catch { return false; }
}

function isMediaContentType(contentType) {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.includes('video/') || ct.includes('audio/') || ct.includes('octet-stream');
}

setInterval(() => {
  const cutoff = Date.now() - MEDIA_TRACKER_MAX_AGE;
  for (const [key, val] of mediaTracker) {
    if (val.detected_at < cutoff) mediaTracker.delete(key);
  }
}, 60_000);

function tryNativeConnect() {
  if (nativePort) return true;
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST);
    port.onMessage.addListener((msg) => console.log('[NativeMessaging] Received:', msg));
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      nativePort = null;
    });
    nativePort = port;
    return true;
  } catch {
    nativePort = null;
    return false;
  }
}
tryNativeConnect();

// === Context Menu ===
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'download-with-zendownload',
    title: 'Download with ZenDownload',
    contexts: ['link', 'video', 'audio', 'image']
  });
  chrome.contextMenus.create({
    id: 'capture-page-links',
    title: 'Capture all links on page',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'download-video',
    title: 'Download this video',
    contexts: ['video']
  });
  chrome.contextMenus.create({
    id: 'download-audio',
    title: 'Download this audio',
    contexts: ['audio']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.srcUrl;
  const resolvedUrl = (url && url.startsWith('blob:')) ? tab?.url : url;
  switch (info.menuItemId) {
    case 'download-with-zendownload':
    case 'download-video':
    case 'download-audio':
      if (resolvedUrl) sendToZenDownload(resolvedUrl, info.frameUrl || tab?.url, tab?.title);
      break;
    case 'capture-page-links':
      chrome.tabs.sendMessage(tab.id, { action: 'capture-all-links' }).catch(() => {});
      break;
  }
});

// === WebRequest Sniffing ===
// TRACKS files in mediaTracker for display and notifies content script
const FILE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|xz|exe|msi|apk|dmg|iso|img|deb|rpm|pkg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|epub|mobi|azw3|mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|mp3|wav|flac|aac|ogg|m4a|opus|wma|jpg|jpeg|png|gif|svg|webp|bmp|torrent)(\?|#|$)/i;
const VIDEO_AUDIO_EXTENSIONS = /\.(mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|m3u8|mpd|mp3|wav|flac|aac|ogg|m4a|opus|wma)(\?|#|$)/i;

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId, type } = details;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('chrome')) return;
    if (url.length > 2048) return;
    if (type === 'main_frame' || type === 'sub_frame') return;

    // Detect file extensions
    if (FILE_EXTENSIONS.test(url)) {
      trackSniffedFile(url, tabId);
      return;
    }

    // Detect media from CDN hosts (X/Twitter, Instagram, TikTok)
    if (type === 'xmlhttprequest' || type === 'fetch') {
      if (isMediaCDN(url) || VIDEO_AUDIO_EXTENSIONS.test(url)) {
        trackSniffedMedia(url, tabId, type);
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { url, tabId, type, responseHeaders } = details;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('chrome')) return;
    if (type === 'main_frame' || type === 'sub_frame') return;

    // Check content-type header for media
    const contentTypeHeader = responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');
    if (contentTypeHeader && isMediaContentType(contentTypeHeader.value)) {
      trackSniffedMedia(url, tabId, type);
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// === Message Handlers ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'send-download':
      sendToZenDownload(message.url, message.pageUrl, message.title, message.extra_meta);
      sendResponse({ ok: true });
      break;
    case 'send-batch':
      sendBatchToZenDownload(message.urls, message.pageUrl).then(count => {
        sendResponse({ ok: true, count });
      });
      return true;
    case 'check-server':
      checkServer().then(ok => sendResponse({ ok }));
      return true;
    case 'get-detected':
      sendResponse({ files: Array.from(mediaTracker.values()), media: Array.from(mediaTracker.values()) });
      break;
    case 'probe-formats':
      probeYouTubeFormats(message.url).then(formats => sendResponse({ formats }));
      return true;
    case 'open-popup-panel':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'show-link-panel' }).catch(() => {});
      });
      break;
    case 'download-detected-file':
      if (message.url) {
        sendToZenDownload(message.url, message.pageUrl, message.title);
        sendResponse({ ok: true });
      }
      break;
  }
});

// Track sniffed files for display in popup — does NOT auto-send
function trackSniffedFile(url, tabId) {
  const fileName = extractFileName(url);
  const ext = fileName.split('.').pop()?.toLowerCase() || 'file';
  mediaTracker.set(url, {
    url,
    file_name: fileName,
    file_type: ext,
    source_page: '',
    depth: 0,
    detected_at: Date.now(),
  });

  if (tabId > 0) {
    chrome.tabs.sendMessage(tabId, {
      action: 'file-detected',
      file: { url, file_name: fileName, file_type: ext, detected_at: Date.now() },
    }).catch(() => {});
  }
}

// Track media URLs detected via content-type or CDN — notifies content script
function trackSniffedMedia(url, tabId, type) {
  if (mediaTracker.has(url)) return;
  const fileName = extractFileName(url);
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let mediaType = 'unknown';
  if (/\.(mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|m3u8|mpd)(\?|#|$)/i.test(url)) mediaType = 'video';
  else if (/\.(mp3|wav|flac|aac|ogg|m4a|opus|wma)(\?|#|$)/i.test(url)) mediaType = 'audio';

  mediaTracker.set(url, {
    url,
    file_name: fileName,
    file_type: ext || 'mp4',
    source_page: '',
    depth: 0,
    detected_at: Date.now(),
    media_type: mediaType,
  });

  if (tabId > 0) {
    chrome.tabs.sendMessage(tabId, {
      action: 'media-detected',
      url,
      type: mediaType,
      detected_at: Date.now(),
    }).catch(() => {});
  }
}

function extractFileName(url) {
  try {
    const u = new URL(url);
    const name = u.pathname.split('/').pop() || '';
    return decodeURIComponent(name) || 'file';
  } catch {
    return 'file';
  }
}

// === Send to ZenDownload ===
// opts: { silent: boolean } — when true, suppresses individual notifications
// (caller is responsible for batched notifications)
async function sendToZenDownload(url, pageUrl, title, extraMeta, opts) {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    if (pageUrl && !pageUrl.startsWith('blob:') && !pageUrl.startsWith('data:')) {
      url = pageUrl;
    } else {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.url && !tabs[0].url.startsWith('chrome://')) {
          url = tabs[0].url;
        } else {
          showNotification('Cannot download', 'This URL requires a browser session');
          return;
        }
      } catch {
        showNotification('Cannot download', 'This is an internal browser URL');
        return;
      }
    }
  }

  // Deduplicate: skip if we already sent this URL recently
  if (isDuplicateUrl(url)) return;

  const urlType = classifyURL(url);
  const fileName = extractFileName(url);
  const ext = fileName.split('.').pop()?.toLowerCase();

  let cookies = '';
  try {
    // Get cookies for both the URL domain and the page URL domain
    const domains = new Set();
    try { domains.add(new URL(url).hostname); } catch {}
    if (pageUrl) try { domains.add(new URL(pageUrl).hostname); } catch {}
    const allCookies = [];
    for (const domain of domains) {
      const c = await chrome.cookies.getAll({ domain });
      allCookies.push(...c);
    }
    // Deduplicate by name+value
    const seen = new Set();
    cookies = allCookies.filter(c => {
      const key = `${c.name}=${c.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(c => `${c.name}=${c.value}`).join('; ');
  } catch {}

  const threads = urlType === 'ytdlp' ? 8 : 4;

  // Build and open zendown:// protocol URL — works without REST API
  const formatId = extraMeta?.format || extraMeta?.format_id;
  const zendownUrl = buildZendownUrl({
    url,
    pageUrl,
    title,
    cookies,
    threads: urlType === 'ytdlp' ? 8 : 4,
    formatId,
    category: guessCategory(ext),
    userAgent: navigator.userAgent,
  });
  openZendown(zendownUrl);

  // Also try REST API as fallback (if app is already running but protocol not registered)
  const payload = {
    url,
    save_path: null,
    threads,
    category: guessCategory(ext),
    download_type: urlType,
    extra_meta: JSON.stringify({
      source: 'browser_extension',
      page_url: pageUrl,
      page_title: title,
      cookies: cookies || null,
      user_agent: navigator.userAgent,
      ...(extraMeta || {}),
    }),
  };

  if (nativePort) {
    try {
      nativePort.postMessage({ message_type: 'download', url, filename: fileName, referrer: pageUrl, timestamp: Date.now() });
      return;
    } catch { nativePort = null; }
  }

  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      if (!opts?.silent) showNotification('Sent to ZenDownload', fileName);
    } else {
      if (!opts?.silent) showNotification('ZenDownload error', `Server returned ${res.status}`);
    }
  } catch {
    // Silent — zendown:// already handled it
  }
}

async function sendBatchToZenDownload(urls, pageUrl) {
  // Deduplicate URLs before sending
  const uniqueUrls = urls.filter(url => !isDuplicateUrl(url));
  if (uniqueUrls.length === 0) {
    showNotification('ZenDownload', 'All files were already queued recently');
    return 0;
  }

  let count = 0;
  const batchSize = 5;

  // Replace original list with filtered unique urls
  urls = uniqueUrls;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(url => {
        const urlType = classifyURL(url);
        return fetch(`${ZENDOWNLOAD_API}/api/downloads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            save_path: null,
            threads: urlType === 'ytdlp' ? 8 : 4,
            category: guessCategory(extractFileName(url).split('.').pop()?.toLowerCase()),
            download_type: urlType,
            extra_meta: JSON.stringify({ source: 'browser_extension_batch', page_url: pageUrl }),
          }),
        }).then(r => r.ok ? 1 : 0);
      })
    );
    count += results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
  }
  showNotification('Sent to ZenDownload', `${count} of ${urls.length} files added`);
}

async function probeYouTubeFormats(url) {
  // Always pass browser cookies for authenticated probing.
  // Many sites (Reddit, YouTube, X, Instagram, etc.) require auth for content.
  try {
    let cookies = '';
    try {
      const domains = new Set();
      try { domains.add(new URL(url).hostname); } catch {}
      // Also check parent domain for cookie-based auth
      const host = new URL(url).hostname;
      const parts = host.split('.');
      if (parts.length > 2) {
        domains.add(parts.slice(-2).join('.')); // e.g. reddit.com from www.reddit.com
      }
      const allCookies = [];
      for (const domain of domains) {
        const c = await chrome.cookies.getAll({ domain });
        allCookies.push(...c);
      }
      const seen = new Set();
      cookies = allCookies.filter(c => {
        const key = `${c.name}=${c.value}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).map(c => `${c.name}=${c.value}`).join('; ');
    } catch {}

    const extraMeta = cookies ? JSON.stringify({
      cookies,
      user_agent: navigator.userAgent,
    }) : null;

    const res = await fetch(`${ZENDOWNLOAD_API}/api/probe`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, extra_meta: extraMeta }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.formats?.length > 0) return data.data.formats;
    }
  } catch {}

  // Fallback to GET probe without cookies
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/probe?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.formats?.length > 0) return data.data.formats;
    }
  } catch {}

  // Last resort: /api/info
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/info?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.formats?.length > 0) return data.data.formats;
    }
  } catch {}
  return null;
}

async function checkServer() {
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/health`, { method: 'GET', signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function guessCategory(extension) {
  if (!extension) return null;
  const video = ['mp4','mkv','avi','webm','mov','flv','wmv','3gp','m4v','ts','m2ts'];
  const audio = ['mp3','wav','flac','aac','ogg','m4a','opus','wma'];
  const archive = ['zip','rar','7z','tar','gz','bz2','xz','iso','dmg'];
  const docs = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','epub'];
  if (video.includes(extension)) return 'Video';
  if (audio.includes(extension)) return 'Music';
  if (archive.includes(extension)) return 'Compressed';
  if (docs.includes(extension)) return 'Documents';
  return null;
}

// === Notification System with Deduplication ===
// Prevents notification spam by batching multiple downloads into one notification.
const recentNotifications = new Map(); // title -> last shown timestamp
const NOTIFICATION_COOLDOWN = 5000; // 5 seconds between same-title notifications

function showNotification(title, message) {
  // Respect the user's "Show notifications" setting from options page
  chrome.storage.local.get(['showNotifications'], (result) => {
    if (result.showNotifications === false) return; // User disabled notifications

    const now = Date.now();
    const lastShown = recentNotifications.get(title);
    if (lastShown && (now - lastShown) < NOTIFICATION_COOLDOWN) {
      return; // Skip — too soon to show the same notification again
    }
    recentNotifications.set(title, now);

    // Clean up old entries periodically
    if (recentNotifications.size > 50) {
      for (const [key, ts] of recentNotifications) {
        if (now - ts > NOTIFICATION_COOLDOWN * 2) recentNotifications.delete(key);
      }
    }

    const id = `zd-${++notificationId}`;
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title,
      message: message.length > 200 ? message.slice(0, 197) + '...' : message,
      priority: 1,
    });
  });
}

// Batched notification for intercepted downloads — shows ONE summary
// instead of one notification per file.
const interceptedBatch = [];
let interceptedTimer = null;

function queueInterceptedNotification(fileName) {
  interceptedBatch.push(fileName);
  if (!interceptedTimer) {
    interceptedTimer = setTimeout(() => {
      const count = interceptedBatch.length;
      const files = interceptedBatch.splice(0);
      if (count === 1) {
        showNotification('Intercepted download', files[0]);
      } else if (count <= 5) {
        showNotification('Intercepted downloads', `${count} files sent to ZenDownload:\n${files.join(', ')}`);
      } else {
        showNotification('Intercepted downloads', `${count} files sent to ZenDownload:\n${files.slice(0, 3).join(', ')} and ${count - 3} more...`);
      }
      interceptedTimer = null;
    }, NOTIFICATION_DEBOUNCE_MS);
  }
}

// === Download Interception ===
// DISABLED by default — user must explicitly enable in extension popup settings.
// When enabled, intercepts Chrome's native downloads and forwards them to ZenDownload.
// Uses batched notifications to avoid flooding the user with one notification per file.
chrome.storage.local.get(['interceptDownloads'], (result) => {
  if (result.interceptDownloads === true) {
    chrome.downloads.onCreated.addListener((item) => {
      if (item.url.startsWith('blob:') || item.url.startsWith('data:')) return;
      if (item.url.startsWith('chrome://') || item.url.startsWith('chrome-extension://')) return;
      if (item.url.includes('turnstile-response') || item.url.includes('cf_challenge')) return;
      if (item.url.includes('gstatic.com') || item.url.includes('googleapis.com')) return;
      if (item.fileSize !== undefined && item.fileSize > 0 && item.fileSize < 1024) return;
      // Skip chrome-extension:// and internal URLs
      if (/^https?:\/\/localhost:\d+\/(extensions|manifest|updates)/.test(item.url)) return;

      const fileName = item.filename ? item.filename.split(/[/\\]/).pop() : extractFileName(item.url);
      sendToZenDownload(item.url, item.referrer, item.filename, undefined, { silent: true });
      queueInterceptedNotification(fileName);
    });
  }
});
