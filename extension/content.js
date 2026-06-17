(function () {
  'use strict';

  const ST = { fbtn: null, activeEl: null, hideT: null, picker: null, scanInt: null, panelOpen: false, capturedMedia: new Map() };
  const MEDIA_EXT = /\.(mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|m3u8|mpd|ogg|ogv|opus|mp3|wav|flac|aac|m4a|wma)(\?|#|$)/i;
  const FILE_EXT = /\.(zip|rar|7z|tar|gz|bz2|xz|exe|msi|apk|dmg|iso|img|deb|rpm|pkg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|epub|mobi|azw3|mp4|mkv|avi|webm|mov|flv|wmv|3gp|m4v|ts|m2ts|mp3|wav|flac|aac|ogg|m4a|opus|wma|jpg|jpeg|png|gif|svg|webp|bmp|torrent|m3u8|mpd)(\?|#|$)/i;
const isYT = () => /(youtube\.com|youtu\.be)$/.test(location.hostname);

  // ============================================================
  //  NETWORK INTERCEPTION
  // ============================================================
  let netHijacked = false;
  function hijackNet() {
    if (netHijacked) return; netHijacked = true;
    const origF = window.fetch;
    window.fetch = async function(...a) {
      const r = await origF.apply(this, a);
      try {
        const u = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url);
        if (u && MEDIA_EXT.test(u)) ST.capturedMedia.set(u, { url: u, ts: Date.now() });
      } catch {}
      return r;
    };
    const origO = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u) { this.__zu = u; return origO.apply(this, arguments); };
    const origS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      if (this.__zu && MEDIA_EXT.test(this.__zu)) ST.capturedMedia.set(this.__zu, { url: this.__zu, ts: Date.now() });
      return origS.apply(this, arguments);
    };
  }
  hijackNet();

  // ============================================================
  //  SHADOW DOM + IFRAME TRAVERSAL
  // ============================================================
  function deepQ(root, sel) {
    let r = [];
    try { r = Array.from(root.querySelectorAll(sel)); } catch {}
    try { root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) r = r.concat(deepQ(e.shadowRoot, sel)); }); } catch {}
    return r;
  }

  // ============================================================
  //  FLOATING DOWNLOAD BUTTON
  // ============================================================
  function mkBtn() {
    if (ST.fbtn) return;
    const b = document.createElement('div');
    b.className = 'zd-floating-btn';
    b.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg><span class="zd-btn-label">Download</span>';
    b.onclick = e => { e.stopPropagation(); e.preventDefault(); doDl(); };
    b.addEventListener('mouseenter', () => { if (ST.hideT) { clearTimeout(ST.hideT); ST.hideT = null; } });
    b.addEventListener('mouseleave', () => hideBtn());
    document.body.appendChild(b);
    ST.fbtn = b;
  }
  function posBtn(el) {
    if (!ST.fbtn) return;
    const r = el.getBoundingClientRect();
    // Position at the bottom-right CORNER of the element (outside its bounds)
    // so it never overlaps other interactive elements like player controls or nav buttons.
    const btnW = 130, btnH = 32;
    if (el.tagName === 'A') {
      // For links: top-right corner outside
      ST.fbtn.style.top = Math.max(4, r.top - btnH - 4) + 'px';
      ST.fbtn.style.left = Math.max(4, r.right - btnW) + 'px';
      ST.fbtn.querySelector('.zd-btn-label').textContent = 'Download file';
    } else {
      // For video/audio/button elements: bottom-right corner outside
      ST.fbtn.style.top = Math.max(4, r.bottom + 4) + 'px';
      ST.fbtn.style.left = Math.max(4, r.right - btnW) + 'px';
      ST.fbtn.querySelector('.zd-btn-label').textContent = 'Download';
    }
    // Keep button within viewport bounds
    const vpW = window.innerWidth, vpH = window.innerHeight;
    const curLeft = parseInt(ST.fbtn.style.left) || 0;
    const curTop = parseInt(ST.fbtn.style.top) || 0;
    if (curLeft + btnW > vpW) ST.fbtn.style.left = Math.max(4, vpW - btnW - 4) + 'px';
    if (curTop + btnH > vpH) ST.fbtn.style.top = Math.max(4, vpH - btnH - 4) + 'px';
  }
  function showBtn(el) { mkBtn(); ST.activeEl = el; ST.fbVisible = true; posBtn(el); ST.fbtn.classList.add('zd-visible'); if (ST.hideT) { clearTimeout(ST.hideT); ST.hideT = null; } }
  function hideBtn() { if (ST.hideT) clearTimeout(ST.hideT); ST.hideT = setTimeout(() => { if (ST.fbtn) ST.fbtn.classList.remove('zd-visible'); ST.activeEl = null; ST.fbVisible = false; }, 400); }

  // ============================================================
  //  DOWNLOAD LOGIC — universal routing
  // ============================================================
  function doDl() {
    const el = ST.activeEl;
    if (!el) return;
    if (el.tagName === 'A') { const u = el.href; if (u && !/^(blob|data|javascript):/i.test(u)) { sendIt(u); return; } }
    let src = findSrc(el);
    // Direct media URL with recognized extension → download directly
    if (src && !/^(blob|data):/i.test(src) && MEDIA_EXT.test(src)) { sendIt(src); return; }
    // Blob URL, data URL, no source, or unknown URL → yt-dlp quality picker
    showPicker(location.href);
  }

  function findSrc(el) {
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      let s = el.currentSrc || el.src; if (s && s !== location.href) return s;
      const srcEl = el.querySelector('source[src]'); if (srcEl) return srcEl.src;
    }
    const inner = el.querySelector('video, audio');
    if (inner) {
      let s = inner.currentSrc || inner.src; if (s && s !== location.href) return s;
      const srcEl = inner.querySelector('source[src]'); if (srcEl) return srcEl.src;
    }
    let c = el;
    for (let i = 0; i < 10 && c && c !== document.body; i++) {
      const s = c.src || c.href || c.dataset?.src || c.dataset?.url || c.getAttribute('data-video-url')
        || c.getAttribute('data-stream-url') || c.getAttribute('data-media-url') || c.getAttribute('data-source')
        || c.getAttribute('data-mp4') || c.getAttribute('data-video-src') || c.getAttribute('data-hls-url');
      if (s && s !== location.href && !s.startsWith('javascript:')) return s;
      if (c.poster && c.tagName === 'VIDEO') return c.poster;
      c = c.parentElement;
    }
    const any = document.querySelector('video[src], video > source[src], audio[src], audio > source[src]');
    if (any) { const s = any.currentSrc || any.src || (any.querySelector('source[src]')?.src); if (s && s !== location.href) return s; }
    return null;
  }

  function sendIt(url) {
    chrome.runtime.sendMessage({ action: 'send-download', url, pageUrl: location.href, title: document.title });
    toast('Sent to ZenDownload');
  }

  // ============================================================
  //  QUALITY PICKER
  // ============================================================
  function showPicker(videoUrl) {
    if (ST.picker) return;
    const ov = document.createElement('div');
    ov.className = 'zd-quality-overlay';
    ov.innerHTML = '<div class="zd-quality-panel"><div class="zd-quality-header"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>Select Quality</div><div class="zd-quality-list" id="zd-quality-list"><div class="zd-quality-loading">Fetching available formats...</div></div><button class="zd-quality-cancel">Cancel</button></div>';
    document.body.appendChild(ov); ST.picker = ov;
    ov.querySelector('.zd-quality-cancel').onclick = () => { ov.remove(); ST.picker = null; };
    ov.onclick = e => { if (e.target === ov) { ov.remove(); ST.picker = null; } };
    const list = ov.querySelector('#zd-quality-list');
    chrome.runtime.sendMessage({ action: 'probe-formats', url: videoUrl }, resp => {
      if (resp?.formats?.length) renderF(list, resp.formats, videoUrl, ov);
      else renderD(list, videoUrl, ov);
    });
  }
  function renderF(list, fmts, url, ov) {
    list.innerHTML = '';
    const g = {};
    fmts.forEach(f => { const k = f.resolution || f.quality_label || f.format_note || 'x'; if (!g[k]) g[k] = []; g[k].push(f); });
    Object.keys(g).sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0)).reverse().forEach(res => {
      const best = g[res][0], label = best.quality_label || best.format_note || res;
      const it = document.createElement('div'); it.className = 'zd-quality-item';
      it.innerHTML = '<span class="zd-quality-res">'+label+'</span><span class="zd-quality-ext">'+(best.extension||best.ext||'mp4')+'</span>'+(best.filesize?'<span class="zd-quality-size">'+(best.filesize/1048576).toFixed(1)+' MB</span>':'')+'<span class="zd-quality-btn">Download</span>';
      it.onclick = () => { chrome.runtime.sendMessage({ action: 'send-download', url, pageUrl: location.href, title: document.title, extra_meta: { format: best.format_id || 'best' } }); toast('Sending '+label); ov.remove(); ST.picker = null; };
      list.appendChild(it);
    });
  }
  function renderD(list, url, ov) {
    list.innerHTML = '';
    [['Best','best'],['4K','bestvideo[height<=2160]+bestaudio/best[height<=2160]'],['1080p','bestvideo[height<=1080]+bestaudio/best[height<=1080]'],['720p','bestvideo[height<=720]+bestaudio/best[height<=720]'],['480p','bestvideo[height<=480]+bestaudio/best[height<=480]'],['360p','bestvideo[height<=360]+bestaudio/best[height<=360]'],['Audio','bestaudio/best']].forEach(([l,f]) => {
      const it = document.createElement('div'); it.className = 'zd-quality-item';
      it.innerHTML = '<span class="zd-quality-res">'+l+'</span><span class="zd-quality-ext">mp4</span><span class="zd-quality-btn">Download</span>';
      it.onclick = () => { chrome.runtime.sendMessage({ action: 'send-download', url, pageUrl: location.href, title: document.title, extra_meta: { format: f } }); toast('Sending '+l); ov.remove(); ST.picker = null; };
      list.appendChild(it);
    });
  }

  function toast(m) { const ex=document.querySelector('.zd-toast'); if(ex)ex.remove(); const t=document.createElement('div'); t.className='zd-toast';t.textContent=m; document.body.appendChild(t); requestAnimationFrame(()=>t.classList.add('zd-toast-visible')); setTimeout(()=>{t.classList.remove('zd-toast-visible');setTimeout(()=>t.remove(),300)},2500); }

  // ============================================================
  //  ATTACH TO ELEMENTS — show button on ANY video/audio/file-link
  // ============================================================
  function attach(el) {
    if (el.dataset.zd) return; el.dataset.zd = '1';
    el.addEventListener('mouseenter', () => showBtn(el));
    el.addEventListener('mouseleave', hideBtn);
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      el.addEventListener('timeupdate', () => { if (ST.activeEl === el) posBtn(el); }, { passive: true });
      el.addEventListener('play', () => { if (ST.activeEl === el) posBtn(el); }, { passive: true });
    }
  }
  function attachLink(a) { if (FILE_EXT.test(a.href) && !a.dataset.zd) { a.dataset.zd='1'; a.addEventListener('mouseenter',()=>showBtn(a)); a.addEventListener('mouseleave',hideBtn); } }

  // ============================================================
  //  SCAN ALL — aggressive detection on any site
  // ============================================================
  function scan() {
    // All video/audio elements including Shadow DOM
    deepQ(document, 'video, audio').forEach(attach);
    // File download links
    document.querySelectorAll('a[href]').forEach(a => attachLink(a));
    // Video player containers — look for src attributes
    const containers = '[class*="video"],[class*="player"],[class*="media"],[id*="video"],[id*="player"],[id*="media"],[data-video-url],[data-stream-url],[data-src],[data-video-src],[data-hls-url],[data-mp4],video-js,[class*="plyr"],[class*="jw"],[class*="flowplayer"],[class*="vjs"],[class*="video-container"],[class*="html5-video"],[class*="video-wrapper"],[class*="player-wrapper"]';
    try {
      document.querySelectorAll(containers).forEach(el => {
        if (el.dataset.zdC) return; el.dataset.zdC = '1';
        const s = el.src || el.href || el.dataset?.src || el.dataset?.url || el.dataset?.videoUrl || el.dataset?.streamUrl || el.querySelector('video,audio')?.currentSrc;
        if ((s && !/^(blob|data|javascript):/i.test(s) && s !== location.href) || el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.querySelector('video,audio')) {
          attach(el);
        }
      });
    } catch {}
    // Iframes
    try { document.querySelectorAll('iframe').forEach(f => { try { const d = f.contentDocument || f.contentWindow?.document; if (d) d.querySelectorAll('video,audio').forEach(attach); } catch {} }); } catch {}
    // Watch for dynamically inserted <video> elements that don't match above selectors
    try { document.querySelectorAll('*').forEach(el => { if ((el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && !el.dataset.zd) attach(el); }); } catch {}
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'show-link-panel') showPanel();
    else if (msg.action === 'media-detected' && msg.url && !/^(blob|data):/i.test(msg.url)) { ST.capturedMedia.set(msg.url,{url:msg.url,ts:Date.now()}); }
  });

  // ============================================================
  //  CAPTURED MEDIA PANEL
  // ============================================================
  function showPanel() {
    if (ST.panelOpen) return; ST.panelOpen = true;
    const items = [...new Map(ST.capturedMedia.values()).values()];
    const p = document.createElement('div'); p.className = 'zd-link-panel';
    p.innerHTML = '<div class="zd-panel-header"><div><h3>Captured Media</h3><p>'+items.length+' items</p></div><button class="zd-panel-close">&times;</button></div><button class="zd-panel-download-all" style="margin:8px 16px;">Download All</button><div class="zd-panel-list"></div>';
    document.body.appendChild(p);
    const list = p.querySelector('.zd-panel-list');
    list.innerHTML = items.length ? items.map(m => '<div class="zd-link-item zd-file"><input type="checkbox" checked data-url="'+m.url.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'"><div class="zd-link-info"><div class="zd-link-text">'+m.url.slice(0,80)+'</div><div class="zd-link-url">'+m.url+'</div></div></div>').join('') : '<div class="zd-empty">No media detected. Play a video to capture its URL.</div>';
    p.querySelector('.zd-panel-close').onclick = () => { p.classList.remove('zd-panel-open'); setTimeout(()=>{p.remove();ST.panelOpen=false;},250); };
    p.querySelector('.zd-panel-download-all').onclick = () => {
      const urls = Array.from(list.querySelectorAll('input:checked')).map(c=>c.dataset.url).filter(Boolean);
      if (urls.length) chrome.runtime.sendMessage({action:'send-batch',urls,pageUrl:location.href});
    };
    requestAnimationFrame(()=>p.classList.add('zd-panel-open'));
  }

  function init() { scan(); new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true}); ST.scanInt = setInterval(scan,2500); window.addEventListener('scroll',()=>{if(ST.activeEl&&ST.fbtn)posBtn(ST.activeEl);},{passive:true}); window.addEventListener('resize',()=>{if(ST.activeEl&&ST.fbtn)posBtn(ST.activeEl);},{passive:true}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
