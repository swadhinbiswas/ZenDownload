// background.js - Service worker for ZenDownload Capture
// Detects downloadable files, videos, and sends them to ZenDownload

const ZENDOWNLOAD_API = 'http://localhost:9527';

// Track media requests for sniffing
const mediaTracker = new Map();

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
      if (url) {
        sendToZenDownload(url, info.frameUrl || tab?.url, tab?.title);
      }
      break;
    case 'capture-page-links':
      chrome.tabs.sendMessage(tab.id, { action: 'capture-all-links' });
      break;
  }
});

// === WebRequest Sniffing ===
const FILE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|xz|exe|msi|apk|dmg|iso|img|deb|rpm|pkg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|epub|mobi|azw3|mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|mp3|wav|flac|aac|ogg|m4a|opus|wma|jpg|jpeg|png|gif|svg|webp|bmp|torrent)(\?|#|$)/i;

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    // Skip data:, blob:, and chrome-extension URLs
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('chrome')) return;
    if (url.length > 2048) return;
    // Detect media file requests
    if (FILE_EXTENSIONS.test(url)) {
      handleSniffedFile(url, details.tabId);
    }
  },
  { urls: ['<all_urls>'] },
  []
);

// === Message Handlers ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'send-download':
      sendToZenDownload(message.url, message.pageUrl, message.title);
      sendResponse({ ok: true });
      break;
    case 'send-batch':
      sendBatchToZenDownload(message.urls, message.pageUrl);
      sendResponse({ ok: true, count: message.urls.length });
      break;
    case 'check-server':
      checkServer().then(ok => sendResponse({ ok }));
      return true;
    case 'get-detected':
      sendResponse({ files: Array.from(mediaTracker.values()) });
      break;
    case 'open-popup-panel':
      // Forward to active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'show-link-panel' });
      });
      break;
  }
});

// === Capture Sniffed File ===
function handleSniffedFile(url, tabId) {
  const fileName = extractFileName(url);
  const fileType = fileName.split('.').pop()?.toLowerCase() || 'file';
  const entry = {
    url,
    file_name: fileName,
    file_type: fileType,
    source_page: '',
    depth: 0,
    detected_at: Date.now(),
  };
  mediaTracker.set(url, entry);

  // Notify content script of new file
  chrome.tabs.sendMessage(tabId, {
    action: 'file-detected',
    file: entry,
  });
}

function extractFileName(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    return path.split('/').pop() || 'file';
  } catch {
    return 'file';
  }
}

// === Send to ZenDownload ===
async function sendToZenDownload(url, pageUrl, title) {
  const fileName = extractFileName(url);
  const fileType = fileName.split('.').pop()?.toLowerCase();
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        save_path: null,
        threads: 4,
        category: guessCategory(fileType),
        extra_meta: {
          source: 'browser_extension',
          page_url: pageUrl,
          page_title: title,
        }
      })
    });
    if (res.ok) {
      showNotification('Sent to ZenDownload', fileName);
    } else {
      showNotification('ZenDownload error', `Server returned ${res.status}`);
    }
  } catch (e) {
    showNotification('ZenDownload offline', 'Make sure the app is running');
  }
}

async function sendBatchToZenDownload(urls, pageUrl) {
  let count = 0;
  for (const url of urls) {
    try {
      const res = await fetch(`${ZENDOWNLOAD_API}/api/downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          save_path: null,
          threads: 4,
          category: null,
          extra_meta: { source: 'browser_extension_batch', page_url: pageUrl }
        })
      });
      if (res.ok) count++;
    } catch (e) {
      // continue
    }
  }
  showNotification('Sent to ZenDownload', `${count} of ${urls.length} files added`);
}

async function checkServer() {
  try {
    const res = await fetch(`${ZENDOWNLOAD_API}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

function guessCategory(extension) {
  const video = ['mp4', 'mkv', 'avi', 'webm', 'mov', 'flv', 'wmv', '3gp', 'm4v', 'ts', 'm2ts'];
  const audio = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma'];
  const archive = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'];
  const docs = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub'];
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
  });
}

// === Listen to downloads (intercept browser's download dialog) ===
chrome.downloads.onCreated.addListener((downloadItem) => {
  // Forward to ZenDownload
  sendToZenDownload(downloadItem.url, downloadItem.referrer, downloadItem.filename);
});
