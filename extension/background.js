const ZENDOWNLOAD_API = 'http://localhost:9527';
const NATIVE_HOST = 'com.zendownload.host';
const MEDIA_TRACKER_MAX_AGE = 30 * 60 * 1000;

const mediaTracker = new Map();
let nativePort = null;

// Periodically prune old entries from mediaTracker
setInterval(() => {
  const cutoff = Date.now() - MEDIA_TRACKER_MAX_AGE;
  for (const [key, val] of mediaTracker) {
    if (val.detected_at < cutoff) mediaTracker.delete(key);
  }
}, 60_000);

// Try native messaging connection
function tryNativeConnect() {
  if (nativePort) return true;
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST);
    port.onMessage.addListener((msg) => console.log('[NativeMessaging] Received:', msg));
    port.onDisconnect.addListener(() => {
      // Suppress runtime.lastError when host is not installed
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
  switch (info.menuItemId) {
    case 'download-with-zendownload':
    case 'download-video':
    case 'download-audio':
      if (url) sendToZenDownload(url, info.frameUrl || tab?.url, tab?.title);
      break;
    case 'capture-page-links':
      chrome.tabs.sendMessage(tab.id, { action: 'capture-all-links' }).catch(() => {});
      break;
  }
});

// === WebRequest Sniffing ===
const FILE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|xz|exe|msi|apk|dmg|iso|img|deb|rpm|pkg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|epub|mobi|azw3|mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|mp3|wav|flac|aac|ogg|m4a|opus|wma|jpg|jpeg|png|gif|svg|webp|bmp|torrent)(\?|#|$)/i;

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId, type } = details;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('chrome')) return;
    if (url.length > 2048) return;
    if (type === 'main_frame' || type === 'sub_frame') return;
    if (FILE_EXTENSIONS.test(url)) {
      handleSniffedFile(url, tabId);
    }
  },
  { urls: ['<all_urls>'] },
  []
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
      sendResponse({ files: Array.from(mediaTracker.values()) });
      break;
    case 'probe-formats':
      probeYouTubeFormats(message.url).then(formats => sendResponse({ formats }));
      return true;
    case 'open-popup-panel':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'show-link-panel' }).catch(() => {});
      });
      break;
  }
});

function handleSniffedFile(url, tabId) {
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
async function sendToZenDownload(url, pageUrl, title, extraMeta) {
  const fileName = extractFileName(url);
  const ext = fileName.split('.').pop()?.toLowerCase();

  const payload = {
    url,
    save_path: null,
    threads: 4,
    category: guessCategory(ext),
    extra_meta: { source: 'browser_extension', page_url: pageUrl, page_title: title, ...(extraMeta || {}) },
  };

  // Try native messaging first
  if (nativePort) {
    try {
      nativePort.postMessage({ message_type: 'download', url, filename: fileName, referrer: pageUrl, timestamp: Date.now() });
      return;
    } catch { nativePort = null; }
  }

  // Fallback to HTTP
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      showNotification('Sent to ZenDownload', fileName);
    } else {
      showNotification('ZenDownload error', `Server returned ${res.status}`);
    }
  } catch {
    showNotification('ZenDownload offline', 'Make sure the app is running');
  }
}

async function sendBatchToZenDownload(urls, pageUrl) {
  let count = 0;
  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(url =>
        fetch(`${ZENDOWNLOAD_API}/api/downloads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            save_path: null,
            threads: 4,
            category: null,
            extra_meta: { source: 'browser_extension_batch', page_url: pageUrl },
          }),
        }).then(r => r.ok ? 1 : 0)
      )
    );
    count += results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
  }
  showNotification('Sent to ZenDownload', `${count} of ${urls.length} files added`);
}

async function probeYouTubeFormats(url) {
  // Try ZenDownload API probe endpoint
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/probe?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.formats && data.formats.length > 0) return data.formats;
    }
  } catch {}
  // Try yt-dlp style info extraction via ZenDownload
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/info?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.formats && data.formats.length > 0) return data.formats;
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

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title,
    message,
    priority: 1,
  });
}

// === Download Interception (opt-in via settings) ===
chrome.storage.local.get(['interceptDownloads'], (result) => {
  if (result.interceptDownloads !== false) {
    chrome.downloads.onCreated.addListener((item) => {
      sendToZenDownload(item.url, item.referrer, item.filename);
    });
  }
});
