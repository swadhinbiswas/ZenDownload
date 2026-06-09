const API = 'http://localhost:9527';

const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const filesCount = document.getElementById('files-count');
const sentCount = document.getElementById('sent-count');
let statsInterval = null;

async function checkServer() {
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      statusEl.className = 'status online';
      statusText.textContent = 'ZenDownload is running';
      return true;
    }
  } catch {}
  statusEl.className = 'status offline';
  statusText.textContent = 'ZenDownload offline';
  return false;
}

async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get-detected' });
    filesCount.textContent = response?.files?.length ?? 0;
  } catch { filesCount.textContent = '0'; }

  try {
    const result = await chrome.storage.local.get(['sentCount']);
    sentCount.textContent = result.sentCount || 0;
  } catch {}
}

async function sendCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'capture-all-links' });
  } catch {}
  const result = await chrome.storage.local.get(['sentCount']);
  await chrome.storage.local.set({ sentCount: (result.sentCount || 0) + 1 });
  window.close();
}

async function openPanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'show-link-panel' });
  } catch {}
  window.close();
}

function openApp() {
  chrome.tabs.create({ url: 'http://localhost:9527' });
  window.close();
}

document.getElementById('capture-page').onclick = sendCapture;
document.getElementById('open-panel').onclick = openPanel;
document.getElementById('open-app').onclick = openApp;

checkServer();
loadStats();
