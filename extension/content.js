// content.js - Injected into every page
// Detects media, adds floating download button on hover, captures links

(function() {
  'use strict';

  // === State ===
  const state = {
    detectedFiles: new Map(),
    pageLinks: [],
    panelOpen: false,
    floatingButton: null,
  };

  // === File detection ===
  const FILE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|xxz|exe|msi|apk|dmg|iso|img|deb|rpm|pkg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|epub|mobi|azw3|mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|mp3|wav|flac|aac|ogg|m4a|opus|wma|jpg|jpeg|png|gif|svg|webp|bmp|torrent)(\?|#|$)/i;

  function isFileLink(url) {
    try {
      const u = new URL(url);
      return FILE_EXTENSIONS.test(u.pathname + (u.search || ''));
    } catch {
      return false;
    }
  }

  function extractFileName(url) {
    try {
      const u = new URL(url);
      const path = u.pathname;
      return decodeURIComponent(path.split('/').pop() || 'file');
    } catch {
      return 'file';
    }
  }

  // === Scan all links on page ===
  function scanPageLinks() {
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => {
      const url = a.href;
      const isFile = isFileLink(url);
      return {
        url,
        text: (a.textContent || '').trim().slice(0, 200),
        is_file: isFile,
        file_type: isFile ? extractFileName(url).split('.').pop()?.toLowerCase() : null,
        file_size: null,
      };
    });
    state.pageLinks = links;
    return links;
  }

  // === Listen for file detection events ===
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'file-detected':
        state.detectedFiles.set(message.file.url, message.file);
        break;
      case 'show-link-panel':
        showLinkPanel();
        break;
      case 'capture-all-links':
        const files = state.pageLinks.filter(l => l.is_file);
        chrome.runtime.sendMessage({
          action: 'send-batch',
          urls: files.map(f => f.url),
          pageUrl: window.location.href,
        });
        break;
    }
  });

  // === Floating button on media elements ===
  function attachFloatingButton(media) {
    if (media.dataset.zdAttached) return;
    media.dataset.zdAttached = '1';

    const show = () => {
      if (!state.floatingButton) {
        state.floatingButton = document.createElement('div');
        state.floatingButton.className = 'zd-floating-btn';
        state.floatingButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download with ZenDownload</span>
        `;
        state.floatingButton.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const src = media.currentSrc || media.src;
          if (src) {
            chrome.runtime.sendMessage({
              action: 'send-download',
              url: src,
              pageUrl: window.location.href,
              title: document.title,
            });
            showToast('Sent to ZenDownload');
          }
        };
        document.body.appendChild(state.floatingButton);
      }
      const rect = media.getBoundingClientRect();
      state.floatingButton.style.top = `${rect.top + window.scrollY + 8}px`;
      state.floatingButton.style.left = `${rect.left + window.scrollX + rect.width - 200}px`;
      state.floatingButton.classList.add('zd-visible');
    };

    const hide = () => {
      if (state.floatingButton) {
        state.floatingButton.classList.remove('zd-visible');
      }
    };

    media.addEventListener('mouseenter', show);
    media.addEventListener('mouseleave', hide);
  }

  // === Find media elements ===
  function scanForMedia() {
    document.querySelectorAll('video, audio').forEach(attachFloatingButton);
  }

  // === Toast notification ===
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'zd-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('zd-toast-visible'), 10);
    setTimeout(() => {
      toast.classList.remove('zd-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // === Link Panel (slide-out) ===
  function showLinkPanel() {
    if (state.panelOpen) return;
    state.panelOpen = true;
    scanPageLinks();

    const panel = document.createElement('div');
    panel.className = 'zd-link-panel';
    const files = state.pageLinks.filter(l => l.is_file);
    const pages = state.pageLinks.filter(l => !l.is_file);

    panel.innerHTML = `
      <div class="zd-panel-header">
        <div>
          <h3>Page Links</h3>
          <p>${state.pageLinks.length} total · ${files.length} files · ${pages.length} pages</p>
        </div>
        <button class="zd-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="zd-panel-filters">
        <button class="zd-filter active" data-filter="all">All</button>
        <button class="zd-filter" data-filter="files">Files</button>
        <button class="zd-filter" data-filter="pages">Pages</button>
        <button class="zd-panel-download-all">Download all files</button>
      </div>
      <div class="zd-panel-list"></div>
    `;
    document.body.appendChild(panel);

    const list = panel.querySelector('.zd-panel-list');
    function renderList(filter = 'all') {
      const items = filter === 'files' ? files : filter === 'pages' ? pages : state.pageLinks;
      list.innerHTML = items.length === 0
        ? '<div class="zd-empty">No links found</div>'
        : items.map(link => `
            <div class="zd-link-item ${link.is_file ? 'zd-file' : 'zd-page'}">
              <input type="checkbox" ${link.is_file ? '' : 'disabled'} data-url="${escapeHtml(link.url)}" ${link.is_file ? 'checked' : ''}>
              <div class="zd-link-info">
                <div class="zd-link-text">${escapeHtml(link.text || link.url)}</div>
                <div class="zd-link-url">${escapeHtml(link.url)}</div>
              </div>
              ${link.is_file ? `<span class="zd-link-type">${link.file_type || ''}</span>` : '<span class="zd-link-external">↗</span>'}
            </div>
          `).join('');
    }
    renderList();

    panel.querySelector('.zd-panel-close').onclick = () => {
      panel.classList.remove('zd-panel-open');
      setTimeout(() => { panel.remove(); state.panelOpen = false; }, 250);
    };
    panel.querySelectorAll('.zd-filter').forEach(btn => {
      btn.onclick = () => {
        panel.querySelectorAll('.zd-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderList(btn.dataset.filter);
      };
    });
    panel.querySelector('.zd-panel-download-all').onclick = () => {
      const checked = list.querySelectorAll('input[type=checkbox]:checked');
      const urls = Array.from(checked).map(c => c.dataset.url);
      if (urls.length === 0) {
        showToast('No files selected');
        return;
      }
      chrome.runtime.sendMessage({
        action: 'send-batch',
        urls,
        pageUrl: window.location.href,
      });
      showToast(`Sending ${urls.length} files to ZenDownload`);
    };

    requestAnimationFrame(() => panel.classList.add('zd-panel-open'));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // === Init ===
  function init() {
    scanForMedia();
    scanPageLinks();

    // Watch for dynamically added media
    const observer = new MutationObserver(() => {
      scanForMedia();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Re-scan links periodically (for SPAs)
    setInterval(scanPageLinks, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
