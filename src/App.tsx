import { useState, useEffect } from "react";

import "./App.css";
import { Sidebar } from "./components/layout/Sidebar";
import { Toolbar } from "./components/layout/Toolbar";
import { DownloadList } from "./components/downloads/DownloadList";
import { useDownloadStore } from "./stores/downloadStore";
import { useSettingsStore } from "./stores/settingsStore";
import { AddDownloadModal } from "./components/modals/AddDownloadModal";
import { SettingsModal } from "./components/modals/SettingsModal";
import { SubscriptionList } from "./components/subscriptions/SubscriptionList";
import { HistoryList } from "./components/HistoryList";
import { GrabberPage } from "./components/pages/GrabberPage";
import { StreamPage } from "./components/pages/StreamPage";
import { MusicPage } from "./components/pages/MusicPage";
import { PlaylistPage } from "./components/pages/PlaylistPage";
import { AdultSitePage } from "./components/pages/AdultSitePage";
import { TVPage } from "./components/pages/TVPage";
import { SiteGrabberPage } from "./components/pages/SiteGrabberPage";
import { AdvancedSettingsPage } from "./components/pages/AdvancedSettingsPage";
import { TorrentSearchPage } from "./components/pages/TorrentSearchPage";
import { FeedPage } from "./components/pages/FeedPage";
import { PluginManagerPage } from "./components/pages/PluginManagerPage";
import { PluginStorePage } from "./components/pages/PluginStorePage";
import { PluginPageRenderer } from "./components/plugins/PluginPageRenderer";
import { SpeedTestPage } from "./components/pages/SpeedTestPage";
import { PerformanceDashboard } from "./components/modals/PerformanceDashboard";
import { M3UImporterModal } from "./components/modals/M3UImporterModal";
import { QueueManagerModal } from "./components/modals/QueueManagerModal";
import { BatchImportModal } from "./components/modals/BatchImportModal";
import { SpeedGraph } from "./components/ui/SpeedGraph";
import { DragDropZone } from "./components/ui/DragDropZone";
import { useDownloadSounds } from "./hooks/useDownloadSounds";
import { onTrayAction } from "./services/notificationService";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const fetchDownloads = useDownloadStore(state => state.fetchDownloads);
  const setupListeners = useDownloadStore(state => state.setupListeners);
  const downloads = useDownloadStore(state => state.downloads);
  const currentView = useDownloadStore(state => state.currentView);
  const setCurrentView = useDownloadStore(state => state.setCurrentView);
  const adultSitesEnabled = useSettingsStore(state => state.adultSitesEnabled);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
  const [isM3uOpen, setIsM3uOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [browserUrl, setBrowserUrl] = useState('');

  // Completion sounds
  useDownloadSounds();

  // Tray menu actions
  useEffect(() => {
    const unsub = onTrayAction(async (action) => {
      switch (action) {
        case 'pause_all':
          await invoke('pause_all_downloads').catch(() => {});
          break;
        case 'resume_all':
          await invoke('resume_all_downloads').catch(() => {});
          break;
        case 'add':
          setIsAddModalOpen(true);
          break;
        case 'open_folder':
          try {
            const path = await invoke<string>('get_default_save_path');
            await revealItemInDir(path);
          } catch {}
          break;
        case 'settings':
          setIsSettingsOpen(true);
          break;
        case 'about':
          setIsSettingsOpen(true);
          break;
      }
    });
    return () => { unsub(); };
  }, []);

  const activeDownloads = downloads.filter(d => d.status === 'Downloading').length;
  const completedDownloads = downloads.filter(d => d.status === 'Completed').length;
  const totalSpeed = downloads.reduce((acc, d) => acc + (d.currentSpeed || 0), 0);

  function formatBytes(bytes: number, decimals = 2) {
    if (!bytes || !isFinite(bytes) || bytes <= 0) return '0 B/s';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[Math.min(i, sizes.length - 1)]}`;
  }

  useEffect(() => {
    fetchDownloads();
    setupListeners();
    useSettingsStore.getState().loadSettings();
    import('./stores/feedStore').then(f => f.useFeedStore.getState().setupListeners());
    import('./stores/pluginStore').then(p => p.usePluginStore.getState().load());
    
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
        listen<{url: string, detected_type: string}>('clipboard-url-detected', (event) => {
            const isClipboardEnabled = useSettingsStore.getState().osClipboard;
            if (isClipboardEnabled) {
                console.log("OS Clipboard Extracted Valid URL:", event.payload.url);
                setBrowserUrl(event.payload.url);
                setIsAddModalOpen(true);
            } else {
                console.log("Ignored clipboard URL because interception is disabled.");
            }
        }).then(u => {
            unlisten = u;
        });
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [fetchDownloads, setupListeners]);

  useEffect(() => {
    const accentPalettes: Record<string, Record<string, string>> = {
      indigo: { '50':'#eef2ff','100':'#e0e7ff','200':'#c7d2fe','300':'#a5b4fc','400':'#818cf8','500':'#6366f1','600':'#4f46e5','700':'#4338ca','800':'#3730a3','900':'#312e81','950':'#1e1b4b' },
      blue: { '50':'#eff6ff','100':'#dbeafe','200':'#bfdbfe','300':'#93c5fd','400':'#60a5fa','500':'#3b82f6','600':'#2563eb','700':'#1d4ed8','800':'#1e40af','900':'#1e3a8a','950':'#172554' },
      purple: { '50':'#faf5ff','100':'#f3e8ff','200':'#e9d5ff','300':'#d8b4fe','400':'#c084fc','500':'#a855f7','600':'#9333ea','700':'#7e22ce','800':'#6b21a8','900':'#581c87','950':'#3b0764' },
      pink: { '50':'#fdf2f8','100':'#fce7f3','200':'#fbcfe8','300':'#f9a8d4','400':'#f472b6','500':'#ec4899','600':'#db2777','700':'#be185d','800':'#9d174d','900':'#831843','950':'#500724' },
      red: { '50':'#fef2f2','100':'#fee2e2','200':'#fecaca','300':'#fca5a5','400':'#f87171','500':'#ef4444','600':'#dc2626','700':'#b91c1c','800':'#991b1b','900':'#7f1d1d','950':'#450a0a' },
      orange: { '50':'#fff7ed','100':'#ffedd5','200':'#fed7aa','300':'#fdba74','400':'#fb923c','500':'#f97316','600':'#ea580c','700':'#c2410c','800':'#9a3412','900':'#7c2d12','950':'#431407' },
      amber: { '50':'#fffbeb','100':'#fef3c7','200':'#fde68a','300':'#fcd34d','400':'#fbbf24','500':'#f59e0b','600':'#d97706','700':'#b45309','800':'#92400e','900':'#78350f','950':'#451a03' },
      emerald: { '50':'#ecfdf5','100':'#d1fae5','200':'#a7f3d0','300':'#6ee7b7','400':'#34d399','500':'#10b981','600':'#059669','700':'#047857','800':'#065f46','900':'#064e3b','950':'#022c22' },
      teal: { '50':'#f0fdfa','100':'#ccfbf1','200':'#99f6e4','300':'#5eead4','400':'#2dd4bf','500':'#14b8a6','600':'#0d9488','700':'#0f766e','800':'#115e59','900':'#134e4a','950':'#042f2e' },
      cyan: { '50':'#ecfeff','100':'#cffafe','200':'#a5f3fc','300':'#67e8f9','400':'#22d3ee','500':'#06b6d4','600':'#0891b2','700':'#0e7490','800':'#155e75','900':'#164e63','950':'#083344' },
      slate: { '50':'#f8fafc','100':'#f1f5f9','200':'#e2e8f0','300':'#cbd5e1','400':'#94a3b8','500':'#64748b','600':'#475569','700':'#334155','800':'#1e293b','900':'#0f172a','950':'#020617' },
      zinc: { '50':'#fafafa','100':'#f4f4f5','200':'#e4e4e7','300':'#d4d4d8','400':'#a1a1aa','500':'#71717a','600':'#52525b','700':'#3f3f46','800':'#27272a','900':'#18181b','950':'#09090b' },
    };

    const syncTheme = () => {
      const state = useSettingsStore.getState();
      const root = document.documentElement;

      const palette = accentPalettes[state.themeAccent] || accentPalettes.indigo;
      for (const [shade, value] of Object.entries(palette)) {
        root.style.setProperty(`--color-indigo-${shade}`, value);
      }

      const fontSizes: Record<string, string> = { small: '13px', default: '14px', large: '16px' };
      const selectedSize = fontSizes[state.themeFontSize] || '14px';
      root.style.setProperty('--app-font-size', selectedSize);
      root.setAttribute('data-font-size', state.themeFontSize || 'default');

      // Theme system is fixed to square corners (no rounded UI).
      // The Corner Roundness option has been removed from the theme settings.
      root.style.setProperty('--radius', '0px');
      void state; // state still drives other theme props below

      root.classList.toggle('compact-mode', !!state.themeCompactMode);
      root.setAttribute('data-background-density', state.themeBackgroundDensity || 'default');

      if (state.forceDarkMode) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    syncTheme();
    const unsubscribe = useSettingsStore.subscribe(() => {
      syncTheme();
    });

    return () => unsubscribe();
  }, []);

  return (
    <DragDropZone onUrlDropped={(url) => { setBrowserUrl(url); setIsAddModalOpen(true); }}>
      <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      <Toolbar
          onAddClick={() => setIsAddModalOpen(true)}
          onGrabberClick={() => setCurrentView('grabber')}
          onStreamClick={() => { setStreamUrl(''); setCurrentView('stream'); }}
          onMusicClick={() => setCurrentView('music')}
          onPlaylistClick={() => setCurrentView('playlist')}
          onSettingsClick={() => setIsSettingsOpen(true)}
          onPerformanceClick={() => setIsPerformanceOpen(true)}
          onM3uClick={() => setIsM3uOpen(true)}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar onOpenQueue={() => setIsQueueOpen(true)} onBatchImport={() => setIsBatchImportOpen(true)} />
        <main className="flex-1 overflow-hidden flex flex-col bg-zinc-950">
          {currentView === 'downloads' ? <DownloadList /> :
           currentView === 'subscriptions' ? <SubscriptionList /> :
           currentView === 'history' ? <HistoryList /> :
           currentView === 'grabber' ? <GrabberPage /> :
           currentView === 'stream' ? <StreamPage initialUrl={streamUrl} /> :
           currentView === 'music' ? <MusicPage /> :
           currentView === 'playlist' ? <PlaylistPage /> :
           currentView === 'adult' && adultSitesEnabled ? <AdultSitePage /> :
           currentView === 'tv' ? <TVPage /> :
           currentView === 'site_grabber' ? <SiteGrabberPage /> :
           currentView === 'advanced' ? <AdvancedSettingsPage /> :
           currentView === 'feed' ? <FeedPage /> :
           currentView === 'plugins' ? <PluginManagerPage onNavigateStore={() => setCurrentView('plugin_store')} /> :
           currentView === 'plugin_store' ? <PluginStorePage onBack={() => setCurrentView('plugins')} /> :
           currentView === 'plugin_page' ? <PluginPageRenderer /> :
           currentView === 'speedtest' ? <SpeedTestPage /> :
           currentView === 'torrent_search' ? <TorrentSearchPage /> :
           <DownloadList />}
        </main>
      </div>
      <div className="h-7 flex items-center justify-between px-4 bg-zinc-950 border-t border-white/[0.04] text-[11px] font-medium relative z-10">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              {activeDownloads > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${activeDownloads > 0 ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            </span>
            <span className="text-zinc-500">{activeDownloads} active</span>
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-600">{completedDownloads} done</span>
        </div>
        <div className="flex items-center gap-2">
          <SpeedGraph totalSpeed={totalSpeed} />
          <span className="text-zinc-600">↓</span>
          <span className="text-cyan-400 font-mono font-medium tabular-nums">{formatBytes(totalSpeed)}</span>
        </div>
      </div>
      <AddDownloadModal initialUrl={browserUrl} 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSwitchToStream={(url) => {
            setIsAddModalOpen(false);
            setStreamUrl(url);
            setCurrentView('stream');
        }}
      />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PerformanceDashboard isOpen={isPerformanceOpen} onClose={() => setIsPerformanceOpen(false)} />
      <M3UImporterModal isOpen={isM3uOpen} onClose={() => setIsM3uOpen(false)} />
      <QueueManagerModal isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
      <BatchImportModal isOpen={isBatchImportOpen} onClose={() => setIsBatchImportOpen(false)} />
      </div>
    </DragDropZone>
  );
}

export default App;
