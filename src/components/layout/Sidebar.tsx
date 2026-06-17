import { Folder, Film, Music, FileText, Package, Zap, CheckCircle, AlertCircle, Clock, Rss, Archive, Globe, MonitorPlay, Headphones, ListVideo, ChevronsUp, Upload, Tv, Layers, Sliders, Puzzle, Bell, Radio, Download, Gauge, Search } from 'lucide-react';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePluginStore } from '../../stores/pluginStore';

interface SidebarProps {
  onOpenQueue?: () => void;
  onBatchImport?: () => void;
}

export function Sidebar({ onOpenQueue, onBatchImport }: SidebarProps = {}) {
  const filterCategory = useDownloadStore(state => state.filterCategory);
  const setFilterCategory = useDownloadStore(state => state.setFilterCategory);
  const downloads = useDownloadStore(state => state.downloads);
  const currentView = useDownloadStore(state => state.currentView);
  const setCurrentView = useDownloadStore(state => state.setCurrentView);
  const adultSitesEnabled = useSettingsStore(state => state.adultSitesEnabled);
  const uiPlugins = usePluginStore(state => state.uiPlugins);
  const setCurrentPlugin = usePluginStore(state => state.setCurrentPlugin);

  const PLUGIN_ICON_MAP: Record<string, React.ReactNode> = {
    Radio: <Radio className="w-4 h-4" />,
    Music: <Music className="w-4 h-4" />,
    Rss: <Rss className="w-4 h-4" />,
    Globe: <Globe className="w-4 h-4" />,
    Film: <Film className="w-4 h-4" />,
    Tv: <Tv className="w-4 h-4" />,
    Download: <Download className="w-4 h-4" />,
    Puzzle: <Puzzle className="w-4 h-4" />,
    Bell: <Bell className="w-4 h-4" />,
    FileText: <FileText className="w-4 h-4" />,
    Zap: <Zap className="w-4 h-4" />,
    Archive: <Archive className="w-4 h-4" />,
    Headphones: <Headphones className="w-4 h-4" />,
  };

  const getCounts = () => {
    const all = downloads.length;
    const active = downloads.filter(d => d.status === 'Downloading').length;
    const completed = downloads.filter(d => d.status === 'Completed').length;
    const paused = downloads.filter(d => d.status === 'Paused').length;
    const error = downloads.filter(d => d.status === 'Error').length;
    const video = downloads.filter(d => d.category === 'Video').length;
    const music = downloads.filter(d => d.category === 'Music').length;
    const compressed = downloads.filter(d => d.category === 'Compressed').length;
    const documents = downloads.filter(d => d.category === 'Documents').length;
    const programs = downloads.filter(d => d.category === 'Programs').length;
    return { all, active, completed, paused, error, video, music, compressed, documents, programs };
  };

  const counts = getCounts();

  type CatItem = { name: string; icon: any; count: number; filter: string | null };

  const categories: CatItem[] = [
    { name: 'All Downloads', icon: Folder, count: counts.all, filter: null },
    { name: 'Video', icon: Film, count: counts.video, filter: 'Video' },
    { name: 'Music', icon: Music, count: counts.music, filter: 'Music' },
    { name: 'Compressed', icon: Package, count: counts.compressed, filter: 'Compressed' },
    { name: 'Documents', icon: FileText, count: counts.documents, filter: 'Documents' },
    { name: 'Programs', icon: Package, count: counts.programs, filter: 'Programs' },
  ];

  const statusCategories: CatItem[] = [
    { name: 'Downloading', icon: Zap, count: counts.active, filter: 'Downloading' },
    { name: 'Completed', icon: CheckCircle, count: counts.completed, filter: 'Completed' },
    { name: 'Paused', icon: Clock, count: counts.paused, filter: 'Paused' },
    { name: 'Error', icon: AlertCircle, count: counts.error, filter: 'Error' },
  ];

  return (
    <aside className="w-56 bg-zinc-950 border-r border-white/[0.06] flex flex-col relative z-10">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 tracking-tight leading-none">ZenDownload</h1>
            <p className="text-[10px] text-zinc-600 font-medium tracking-wider mt-0.5">DOWNLOAD MANAGER</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-5 mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.1em]">Library</h3>
        </div>
        <nav className="space-y-0.5 px-2">
          {categories.map((cat) => {
            const isActive = currentView === 'downloads' && filterCategory === cat.filter;
            return (
              <button
                key={cat.name}
                onClick={() => setFilterCategory(cat.filter)}
                className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
                  isActive
                    ? 'bg-white/[0.07] text-white'
                    : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                }`}
              >
                {isActive && (
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full ${
                    cat.filter === 'Music' ? 'bg-pink-400' : 'bg-indigo-400'
                  }`} />
                )}
                <div className="flex items-center gap-2.5">
                  <cat.icon className={`w-4 h-4 ${
                    isActive
                      ? cat.filter === 'Music' ? 'text-pink-400' : 'text-indigo-400'
                      : 'text-zinc-600'
                  }`} />
                  <span>{cat.name}</span>
                </div>
                {cat.count > 0 && (
                  <span className={`text-[11px] font-semibold tabular-nums ${
                    isActive ? 'text-zinc-300' : 'text-zinc-600'
                  }`}>
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-5 mt-6 mb-2">
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.1em]">Transfers</h3>
        </div>
        <nav className="space-y-0.5 px-2">
          {statusCategories.map((cat) => {
            const isActive = currentView === 'downloads' && filterCategory === cat.filter;
            return (
              <button
                key={cat.name}
                onClick={() => setFilterCategory(cat.filter)}
                className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
                  isActive
                    ? 'bg-white/[0.07] text-white' 
                    : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-indigo-400" />
                )}
                <div className="flex items-center gap-2.5">
                  <cat.icon className={`w-4 h-4 ${
                    cat.name === 'Downloading' ? (isActive ? 'text-emerald-400' : 'text-zinc-600') :
                    cat.name === 'Completed' ? (isActive ? 'text-emerald-400' : 'text-zinc-600') :
                    cat.name === 'Paused' ? (isActive ? 'text-amber-400' : 'text-zinc-600') :
                    (isActive ? 'text-red-400' : 'text-zinc-600')
                  }`} />
                  <span>{cat.name}</span>
                </div>
                {cat.count > 0 && (
                  <span className={`text-[11px] font-semibold tabular-nums ${
                    isActive ? 'text-zinc-300' : 'text-zinc-600'
                  }`}>
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-5 mt-6 mb-2">
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.1em]">Automation</h3>
        </div>
        <nav className="space-y-0.5 px-2">
          <button
            onClick={() => setCurrentView('subscriptions')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'subscriptions'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'subscriptions' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-orange-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Rss className={`w-4 h-4 ${
                currentView === 'subscriptions' ? 'text-orange-400' : 'text-zinc-600'
              }`} />
              <span>Subscriptions</span>
            </div>
          </button>
          {onOpenQueue && (
            <button
              onClick={onOpenQueue}
              className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
              title="Reorder downloads and adjust priority"
            >
              <div className="flex items-center gap-2.5">
                <ChevronsUp className="w-4 h-4 text-amber-400" />
                <span>Queue</span>
              </div>
            </button>
          )}
          {onBatchImport && (
            <button
              onClick={onBatchImport}
              className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
              title="Import multiple URLs at once"
            >
              <div className="flex items-center gap-2.5">
                <Upload className="w-4 h-4 text-indigo-400" />
                <span>Batch Import</span>
              </div>
            </button>
          )}
          <button
            onClick={() => setCurrentView('history')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'history'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'history' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-cyan-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Archive className={`w-4 h-4 ${currentView === 'history' ? 'text-cyan-400' : 'text-zinc-600'}`} />
              <span>Archive</span>
            </div>
          </button>
        </nav>

        <div className="px-5 mt-6 mb-2">
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.1em]">Tools</h3>
        </div>
        <nav className="space-y-0.5 px-2">
          <button
            onClick={() => setCurrentView('grabber')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'grabber'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'grabber' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-purple-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Globe className={`w-4 h-4 ${
                currentView === 'grabber' ? 'text-purple-400' : 'text-zinc-600'
              }`} />
              <span>Video Grabber</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('site_grabber')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'site_grabber'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'site_grabber' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-amber-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Layers className={`w-4 h-4 ${
                currentView === 'site_grabber' ? 'text-amber-400' : 'text-zinc-600'
              }`} />
              <span>Site Crawler</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('stream')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'stream'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'stream' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-indigo-400" />
            )}
            <div className="flex items-center gap-2.5">
              <MonitorPlay className={`w-4 h-4 ${
                currentView === 'stream' ? 'text-indigo-400' : 'text-zinc-600'
              }`} />
              <span>Stream Extractor</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('music')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'music'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'music' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-pink-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Headphones className={`w-4 h-4 ${
                currentView === 'music' ? 'text-pink-400' : 'text-zinc-600'
              }`} />
              <span>Music Downloader</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('tv')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'tv'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'tv' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-emerald-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Tv className={`w-4 h-4 ${
                currentView === 'tv' ? 'text-emerald-400' : 'text-zinc-600'
              }`} />
              <span>Live TV</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('playlist')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'playlist'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'playlist' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-cyan-400" />
            )}
            <div className="flex items-center gap-2.5">
              <ListVideo className={`w-4 h-4 ${
                currentView === 'playlist' ? 'text-cyan-400' : 'text-zinc-600'
              }`} />
              <span>Playlist Downloader</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('plugins')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'plugins' || currentView === 'plugin_store'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {(currentView === 'plugins' || currentView === 'plugin_store') && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-indigo-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Puzzle className={`w-4 h-4 ${currentView === 'plugins' || currentView === 'plugin_store' ? 'text-indigo-400' : 'text-zinc-600'}`} />
              <span>Plugins</span>
            </div>
          </button>
          {uiPlugins.length > 0 && (
            <>
              <div className="px-5 mt-3 mb-1">
                <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.1em]">Apps</h3>
              </div>
              {uiPlugins.map((p) => {
                const isActive = currentView === 'plugin_page' && usePluginStore.getState().currentPluginId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setCurrentPlugin(p.id); setCurrentView('plugin_page'); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
                      isActive
                        ? 'bg-white/[0.07] text-white'
                        : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-indigo-400" />
                    )}
                    <div className="flex items-center gap-2.5">
                      <span className={`${isActive ? 'text-indigo-400' : 'text-zinc-600'}`}>
                        {PLUGIN_ICON_MAP[p.ui!.sidebar_icon] || <Puzzle className="w-4 h-4" />}
                      </span>
                      <span>{p.ui!.sidebar_label}</span>
                    </div>
                  </button>
                );
              })}
            </>
          )}
          <button
            onClick={() => setCurrentView('feed')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'feed'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'feed' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-indigo-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Bell className={`w-4 h-4 ${currentView === 'feed' ? 'text-indigo-400' : 'text-zinc-600'}`} />
              <span>Activity Feed</span>
            </div>
          </button>
          {adultSitesEnabled && (
            <button
              onClick={() => setCurrentView('adult')}
              className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
                currentView === 'adult'
                  ? 'bg-white/[0.07] text-white'
                  : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
              }`}
            >
              {currentView === 'adult' && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-pink-400" />
              )}
              <div className="flex items-center gap-2.5">
                <span className={`text-sm ${currentView === 'adult' ? '' : 'opacity-50'}`}>🔞</span>
                <span>Adult Sites</span>
              </div>
            </button>
          )}
          <button
            onClick={() => setCurrentView('speedtest')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'speedtest'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'speedtest' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-emerald-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Gauge className={`w-4 h-4 ${currentView === 'speedtest' ? 'text-emerald-400' : 'text-zinc-600'}`} />
              <span>Speed Test</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('torrent_search')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'torrent_search'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'torrent_search' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-indigo-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Search className={`w-4 h-4 ${currentView === 'torrent_search' ? 'text-indigo-400' : 'text-zinc-600'}`} />
              <span>Torrent Search</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView('advanced')}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 relative ${
              currentView === 'advanced'
                ? 'bg-white/[0.07] text-white'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            }`}
          >
            {currentView === 'advanced' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-violet-400" />
            )}
            <div className="flex items-center gap-2.5">
              <Sliders className={`w-4 h-4 ${
                currentView === 'advanced' ? 'text-violet-400' : 'text-zinc-600'
              }`} />
              <span>Advanced</span>
            </div>
          </button>
        </nav>
      </div>
    </aside>
  );
}
