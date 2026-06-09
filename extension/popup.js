// popup.js
const API = 'http://localhost:9527';

const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const filesCount = document.getElementById('files-count');
const sentCount = document.getElementById('sent-count');

async function checkServer() {
  try {
    const res = await fetch(`${API}/api/health`);
    if (res.ok) {
      statusEl.classList.remove('offline');
      statusEl.classList.add('online');
      statusText.textContent = 'ZenDownload is running';
      return true;
    }
  } catch {}
  statusEl.classList.remove('online');
  statusEl.classList.add('offline');
  statusText.textContent = 'ZenDownload offline';
  return false;
}

async function loadStats() {
  chrome.runtime.sendMessage({ action: 'get-detected' }, (response) => {
    if (response?.files) {
      filesCount.textContent = response.files.length;
    }
  });
  const result = await chrome.storage.local.get(['sentCount']);
  sentCount.textContent = result.sentCount || 0;
}

document.getElementById('capture-page').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: 'capture-all-links' });
    const result = await chrome.storage.local.get(['sentCount']);
    chrome.storage.local.set({ sentCount: (result.sentCount || 0) + 1 });
    window.close();
  }
};

document.getElementById('open-panel').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: 'show-link-panel' });
    window.close();
  }
};

document.getElementById('open-app').onclick = () => {
  chrome.tabs.create({ url: 'http://localhost:1420' });
  window.close();
};

checkServer();
loadStats();
