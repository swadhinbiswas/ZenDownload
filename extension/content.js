(function() {
  'use strict';

  const state = {
    detectedFiles: new Map(),
    pageLinks: [],
    panelOpen: false,
    floatingButton: null,
    activeMedia: null,
    hideTimeout: null,
    qualityPicker: null,
    scanInterval: null,
  };

  const FILE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|xz|exe|msi|apk|dmg|iso|img|deb|rpm|pkg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|epub|mobi|azw3|mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|mp3|wav|flac|aac|ogg|m4a|opus|wma|jpg|jpeg|png|gif|svg|webp|bmp|torrent)(\?|#|$)/i;

  const YOUTUBE_HOSTS = ['www.youtube.com', 'm.youtube.com', 'youtube.com', 'youtu.be'];
  const isYouTube = () => YOUTUBE_HOSTS.includes(window.location.hostname);

  function isFileLink(url) {
    try { const u = new URL(url); return FILE_EXTENSIONS.test(u.pathname + (u.search || '')); }
    catch { return false; }
  }

  function extractFileName(url) {
    try { const u = new URL(url); return decodeURIComponent(u.pathname.split('/').pop() || '') || 'file'; }
    catch { return 'file'; }
  }

  function scanPageLinks() {
    state.pageLinks = Array.from(document.querySelectorAll('a[href]')).map(a => ({
      url: a.href,
      text: (a.textContent || '').trim().slice(0, 200),
      is_file: isFileLink(a.href),
      file_type: isFileLink(a.href) ? extractFileName(a.href).split('.').pop()?.toLowerCase() : null,
      file_size: null,
    }));
    return state.pageLinks;
  }

  function dedupeLinks(links) {
    const seen = new Set();
    return links.filter(l => { if (seen.has(l.url)) return false; seen.add(l.url); return true; });
  }

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.action) {
      case 'file-detected':
        state.detectedFiles.set(message.file.url, message.file);
        break;
      case 'show-link-panel':
        showLinkPanel();
        break;
      case 'capture-all-links':
        const links = dedupeLinks(state.pageLinks.filter(l => l.is_file));
        if (links.length === 0) return;
        chrome.runtime.sendMessage({ action: 'send-batch', urls: links.map(f => f.url), pageUrl: window.location.href });
        break;
    }
  });

  // === Floating download button ===
  function createFloatingButton() {
    if (state.floatingButton) return;
    const btn = document.createElement('div');
    btn.className = 'zd-floating-btn';
    btn.innerHTML = [
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">',
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>',
      '<polyline points="7 10 12 15 17 10"></polyline>',
      '<line x1="12" y1="15" x2="12" y2="3"></line></svg>',
      '<span>Download with ZenDownload</span>',
    ].join('');
    btn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (state.activeMedia) {
        const src = state.activeMedia.currentSrc || state.activeMedia.src;
        if (!src) return;
        if (isYouTube()) {
          showYouTubeQualityPicker(src);
        } else {
          chrome.runtime.sendMessage({ action: 'send-download', url: src, pageUrl: window.location.href, title: document.title });
          showToast('Sent to ZenDownload');
        }
      }
    };
    // Keep button visible when hovering the button itself
    btn.addEventListener('mouseenter', () => { if (state.hideTimeout) { clearTimeout(state.hideTimeout); state.hideTimeout = null; } });
    btn.addEventListener('mouseleave', () => { hideFloatingButton(); });
    document.body.appendChild(btn);
    state.floatingButton = btn;
  }

  function positionFloatingButton(media) {
    if (!state.floatingButton) return;
    const rect = media.getBoundingClientRect();
    // Position at bottom-center of the video
    state.floatingButton.style.top = `${rect.bottom - 44}px`;
    state.floatingButton.style.left = `${rect.left + rect.width / 2 - 100}px`;
  }

  function showFloatingButton(media) {
    createFloatingButton();
    state.activeMedia = media;
    positionFloatingButton(media);
    state.floatingButton.classList.add('zd-visible');
    if (state.hideTimeout) { clearTimeout(state.hideTimeout); state.hideTimeout = null; }
  }

  function hideFloatingButton() {
    if (state.hideTimeout) clearTimeout(state.hideTimeout);
    state.hideTimeout = setTimeout(() => {
      if (state.floatingButton) state.floatingButton.classList.remove('zd-visible');
      state.activeMedia = null;
      state.hideTimeout = null;
    }, 300);
  }

  function attachFloatingButton(media) {
    if (media.dataset.zdAttached) return;
    media.dataset.zdAttached = '1';
    media.addEventListener('mouseenter', () => showFloatingButton(media));
    media.addEventListener('mouseleave', hideFloatingButton);
    // Update position on scroll/resize
    media.addEventListener('timeupdate', () => { if (state.activeMedia === media) positionFloatingButton(media); }, { passive: true });
  }

  function scanForMedia() {
    document.querySelectorAll('video, audio').forEach(attachFloatingButton);
  }

  // === YouTube quality picker ===
  function showYouTubeQualityPicker(videoUrl) {
    if (state.qualityPicker) return;
    const overlay = document.createElement('div');
    overlay.className = 'zd-quality-overlay';
    overlay.innerHTML = [
      '<div class="zd-quality-panel">',
      '<div class="zd-quality-header">',
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
      'Select Quality</div>',
      '<div class="zd-quality-list" id="zd-quality-list">',
      '<div class="zd-quality-loading">Fetching available formats...</div>',
      '</div>',
      '<button class="zd-quality-cancel">Cancel</button></div>',
    ].join('');
    document.body.appendChild(overlay);
    state.qualityPicker = overlay;

    overlay.querySelector('.zd-quality-cancel').onclick = () => { overlay.remove(); state.qualityPicker = null; };
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); state.qualityPicker = null; } };

    // Fetch formats from ZenDownload API
    const list = overlay.querySelector('#zd-quality-list');
    chrome.runtime.sendMessage({ action: 'probe-formats', url: videoUrl }, (response) => {
      const formats = response?.formats;
      if (formats && formats.length > 0) {
        renderQualityFormats(list, formats, videoUrl, overlay);
      } else {
        renderDefaultQualities(list, videoUrl, overlay);
      }
    });
  }

  function renderQualityFormats(list, formats, videoUrl, overlay) {
    list.innerHTML = '';
    const groups = {};
    for (const f of formats) {
      const key = f.resolution || f.quality_label || f.format_note || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    }
    const sorted = Object.keys(groups).sort((a, b) => {
      const na = parseInt(a) || 0;
      const nb = parseInt(b) || 0;
      return nb - na;
    });
    for (const res of sorted) {
      const group = groups[res];
      const best = group[0];
      const label = best.quality_label || best.format_note || res;
      const ext = best.extension || 'mp4';
      const item = document.createElement('div');
      item.className = 'zd-quality-item';
      item.innerHTML = [
        '<span class="zd-quality-res">', label, '</span>',
        '<span class="zd-quality-ext">', ext, '</span>',
        best.filesize ? '<span class="zd-quality-size">' + (best.filesize / 1024 / 1024).toFixed(1) + ' MB</span>' : '',
        '<span class="zd-quality-btn">Download</span>',
      ].join('');
      item.onclick = () => {
        chrome.runtime.sendMessage({
          action: 'send-download', url: videoUrl, pageUrl: window.location.href,
          title: document.title,
          extra_meta: { format_id: best.format_id || 'best', source: 'youtube_quality_picker' },
        });
        showToast('Sending ' + label + ' to ZenDownload');
        overlay.remove(); state.qualityPicker = null;
      };
      list.appendChild(item);
    }
  }

  function renderDefaultQualities(list, videoUrl, overlay) {
    list.innerHTML = '';
    const defaults = [
      { label: 'Best Video+Audio', format: 'best', ext: 'mp4' },
      { label: '4K (2160p)', format: 'bestvideo[height<=2160]+bestaudio/best[height<=2160]', ext: 'mp4' },
      { label: '1080p (Full HD)', format: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', ext: 'mp4' },
      { label: '720p (HD)', format: 'bestvideo[height<=720]+bestaudio/best[height<=720]', ext: 'mp4' },
      { label: '480p (SD)', format: 'bestvideo[height<=480]+bestaudio/best[height<=480]', ext: 'mp4' },
      { label: '360p', format: 'bestvideo[height<=360]+bestaudio/best[height<=360]', ext: 'mp4' },
      { label: 'Audio Only (MP3)', format: 'bestaudio/best', ext: 'mp3' },
    ];
    for (const opt of defaults) {
      const item = document.createElement('div');
      item.className = 'zd-quality-item';
      item.innerHTML = [
        '<span class="zd-quality-res">', opt.label, '</span>',
        '<span class="zd-quality-ext">', opt.ext, '</span>',
        '<span class="zd-quality-btn">Download</span>',
      ].join('');
      item.onclick = () => {
        chrome.runtime.sendMessage({
          action: 'send-download', url: videoUrl, pageUrl: window.location.href,
          title: document.title,
          extra_meta: { format_id: opt.format, source: 'youtube_quality_picker' },
        });
        showToast('Sending ' + opt.label + ' to ZenDownload');
        overlay.remove(); state.qualityPicker = null;
      };
      list.appendChild(item);
    }
  }
  }

  // === Toast ===
  function showToast(message) {
    const existing = document.querySelector('.zd-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'zd-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('zd-toast-visible'));
    setTimeout(() => {
      toast.classList.remove('zd-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // === Link Panel ===
  function showLinkPanel() {
    if (state.panelOpen) return;
    state.panelOpen = true;
    const allLinks = dedupeLinks(scanPageLinks());
    const files = allLinks.filter(l => l.is_file);
    const pages = allLinks.filter(l => !l.is_file);

    const panel = document.createElement('div');
    panel.className = 'zd-link-panel';
    panel.innerHTML = [
      '<div class="zd-panel-header">',
      '<div><h3>Page Links</h3><p>', allLinks.length, ' total · ', files.length, ' files · ', pages.length, ' pages</p></div>',
      '<button class="zd-panel-close">&times;</button></div>',
      '<div class="zd-panel-filters">',
      '<button class="zd-filter active" data-filter="all">All</button>',
      '<button class="zd-filter" data-filter="files">Files</button>',
      '<button class="zd-filter" data-filter="pages">Pages</button>',
      '<button class="zd-panel-download-all">Download all files</button></div>',
      '<div class="zd-panel-list"></div>',
    ].join('');
    document.body.appendChild(panel);

    const list = panel.querySelector('.zd-panel-list');
    function renderList(filter = 'all') {
      const items = filter === 'files' ? files : filter === 'pages' ? pages : allLinks;
      if (items.length === 0) { list.innerHTML = '<div class="zd-empty">No links found</div>'; return; }
      const fragment = document.createDocumentFragment();
      for (const link of items) {
        const div = document.createElement('div');
        div.className = `zd-link-item ${link.is_file ? 'zd-file' : 'zd-page'}`;
        div.innerHTML = [
          '<input type="checkbox"', link.is_file ? ` data-url="${escapeAttr(link.url)}" checked` : ' disabled', '>',
          '<div class="zd-link-info">',
          '<div class="zd-link-text">', escapeHtml(link.text || link.url), '</div>',
          '<div class="zd-link-url">', escapeHtml(link.url), '</div></div>',
          link.is_file ? '<span class="zd-link-type">' + (link.file_type || '') + '</span>' : '<span class="zd-link-external">\u2197</span>',
        ].join('');
        fragment.appendChild(div);
      }
      list.innerHTML = '';
      list.appendChild(fragment);
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
      const urls = Array.from(checked).map(c => c.dataset.url).filter(Boolean);
      if (urls.length === 0) { showToast('No files selected'); return; }
      chrome.runtime.sendMessage({ action: 'send-batch', urls, pageUrl: window.location.href });
      showToast(`Sending ${urls.length} files to ZenDownload`);
    };
    requestAnimationFrame(() => panel.classList.add('zd-panel-open'));
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function escapeAttr(s) { return String(s).replace(/[&"<>']/g, c => ({ '&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;' }[c])); }

  // === Init ===
  function init() {
    scanForMedia();
    scanPageLinks();
    const observer = new MutationObserver(() => scanForMedia());
    observer.observe(document.body, { childList: true, subtree: true });
    state.scanInterval = setInterval(scanPageLinks, 3000);
    // Update button position on scroll
    window.addEventListener('scroll', () => { if (state.activeMedia && state.floatingButton) positionFloatingButton(state.activeMedia); }, { passive: true });
    window.addEventListener('resize', () => { if (state.activeMedia && state.floatingButton) positionFloatingButton(state.activeMedia); }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
