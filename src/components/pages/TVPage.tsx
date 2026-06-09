import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import Hls from 'hls.js';
import {
  Search, Globe, Tv, Play, Pause, ChevronLeft, Loader2, AlertCircle, Wifi,
  Grid3x3, List, Star, Heart, Filter, RefreshCw, ChevronDown, ChevronRight,
  Sparkles, Film, Newspaper, Music2, Baby, BookOpen, Tv2, X, Volume2,
  TrendingUp, Zap, ExternalLink, Radio, Download, Trash2,
} from 'lucide-react';
import { countryFlag, regionFlag, REGIONS } from '../../utils/flags';
import { VirtualList } from '../ui/VirtualList';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { addUserPlaylist, listUserPlaylists, deleteUserPlaylist, importCustomM3u, UserPlaylist } from '../../services/iptvService';

interface IptvChannel {
  id: string;
  name: string;
  url: string;
  logo: string | null;
  group: string | null;
  categories: string[];
  primary_category: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  language: string | null;
  quality: string | null;
  tvg_id: string | null;
}

interface ChannelBatch {
  batch_index: number;
  total_channels: number;
  channels: IptvChannel[];
  progress: number;
}

interface CountryGroup { code: string; name: string; count: number; region: string | null; }
interface RegionGroup { name: string; count: number; countries: CountryGroup[]; }
interface CategoryGroup { id: string; name: string; count: number; description: string; }
interface LanguageGroup { name: string; count: number; }
interface ChannelSummary {
  total: number;
  by_country: CountryGroup[];
  by_region: RegionGroup[];
  by_category: CategoryGroup[];
  by_language: LanguageGroup[];
}

const IPTV_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const FAVORITES_KEY = 'tv-favorites';
const VIEW_MODE_KEY = 'tv-view-mode';

const CATEGORY_META: Record<string, { icon: any; color: string; description: string }> = {
  Sports:       { icon: Filter,         color: 'text-emerald-400',  description: 'Live sports, football, basketball & more' },
  News:         { icon: Newspaper,      color: 'text-blue-400',     description: 'Breaking news & current affairs' },
  Movies:       { icon: Film,           color: 'text-rose-400',     description: 'Movies & films' },
  Music:        { icon: Music2,         color: 'text-purple-400',   description: 'Music channels & radio' },
  Kids:         { icon: Baby,           color: 'text-amber-400',    description: 'Children & cartoons' },
  Documentary:  { icon: BookOpen,       color: 'text-cyan-400',     description: 'Documentaries & nature' },
  Entertainment:{ icon: Sparkles,       color: 'text-pink-400',     description: 'General entertainment' },
  Series:       { icon: Tv2,            color: 'text-orange-400',   description: 'TV series & shows' },
  General:      { icon: Tv,             color: 'text-zinc-400',     description: 'General programming' },
  Education:    { icon: BookOpen,       color: 'text-teal-400',     description: 'Educational content' },
  Religious:    { icon: BookOpen,       color: 'text-yellow-400',   description: 'Religious & spiritual' },
  Lifestyle:    { icon: Heart,          color: 'text-pink-300',     description: 'Lifestyle & home' },
  Comedy:       { icon: Sparkles,       color: 'text-yellow-300',   description: 'Comedy & humor' },
  Weather:      { icon: Sparkles,       color: 'text-sky-400',      description: 'Weather forecasts' },
  Auto:         { icon: Sparkles,       color: 'text-red-400',      description: 'Automotive' },
  Business:     { icon: Sparkles,       color: 'text-slate-400',    description: 'Business & finance' },
  Cooking:      { icon: Sparkles,       color: 'text-orange-300',   description: 'Cooking & food' },
  Outdoor:      { icon: Sparkles,       color: 'text-green-400',    description: 'Outdoor & nature' },
  Science:      { icon: Sparkles,       color: 'text-indigo-400',   description: 'Science & technology' },
  Relax:        { icon: Sparkles,       color: 'text-violet-300',   description: 'Relaxation & meditation' },
  Public:       { icon: Sparkles,       color: 'text-stone-400',    description: 'Public access' },
  Shopping:     { icon: Sparkles,       color: 'text-pink-500',     description: 'TV shopping' },
  Culture:      { icon: Sparkles,       color: 'text-fuchsia-400',  description: 'Arts & culture' },
  Other:        { icon: Tv,             color: 'text-zinc-500',     description: 'Uncategorized' },
};

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'popular' | 'recent';
type TabType = 'discover' | 'all' | 'category' | 'country' | 'region' | 'language' | 'favorites' | 'playlists';

// Curated set of "popular" country codes that appear on the discover landing.
// Sorted roughly by IPTV channel availability, but the data is dynamic.
const POPULAR_COUNTRY_CODES = [
  'US', 'GB', 'IN', 'DE', 'BR', 'FR', 'IT', 'ES', 'CA', 'AU',
  'JP', 'KR', 'CN', 'TR', 'MX', 'AR', 'NL', 'RU', 'PL', 'SE',
];

// GitHub Dark palette vars — scoped to TVPage only
const tvStyles = {
  bg: '#0D1117',
  panel: '#161B22',
  card: '#1C2128',
  cardHover: '#252D3A',
  border: 'rgba(255,255,255,0.06)',
  text: '#E6EDF3',
  muted: '#8B949E',
  subtle: '#484F58',
};

export function TVPage() {
  // Channel data
  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [summary, setSummary] = useState<ChannelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadBytes, setDownloadBytes] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [totalToLoad, setTotalToLoad] = useState(0);
  const [, setBatchesReceived] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState<TabType>('discover');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return (stored === 'list' || stored === 'grid') ? stored : 'grid';
  });
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  // Player
  const [nowPlaying, setNowPlaying] = useState<IptvChannel | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [volume] = useState(0.8);
  const [showPlayer, setShowPlayer] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const channelsRef = useRef<IptvChannel[]>([]);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  // Persist favorites
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Keep ref in sync
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // Try cached first, then load
  useEffect(() => {
    let unlistens: UnlistenFn[] = [];
    let cancelled = false;

    (async () => {
      try {
        // Check cache first for instant load
        const cached = await invoke<IptvChannel[] | null>('get_cached_iptv_channels');
        if (cached && cached.length > 0) {
          setChannels(cached);
          setBatchesReceived(1);
          setTotalToLoad(cached.length);
          const cachedSummary = await invoke<ChannelSummary | null>('get_cached_iptv_summary');
          if (cachedSummary) setSummary(cachedSummary);
          setLoading(false);
          return;
        }
        await loadChannels(unlistens, cancelled);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unlistens.forEach(u => u());
    };
  }, []);

  const loadChannels = async (unlistens: UnlistenFn[], cancelled: boolean) => {
    setLoading(true);
    setError(null);
    setChannels([]);
    setBatchesReceived(0);
    setDownloadBytes(0);
    setDownloadProgress(0);
    setTotalToLoad(0);

    const batchUnlisten = await listen<ChannelBatch>('iptv-batch', (e) => {
      if (cancelled) return;
      const batch = e.payload;
      setTotalToLoad(batch.total_channels);
      setDownloadProgress(batch.progress);
      setBatchesReceived(prev => prev + 1);
      setChannels(prev => {
        const seen = new Set(prev.map(c => c.id));
        const newOnes = batch.channels.filter(c => !seen.has(c.id));
        return [...prev, ...newOnes];
      });
    });
    unlistens.push(batchUnlisten);

    const summaryUnlisten = await listen<ChannelSummary>('iptv-summary', (e) => {
      if (cancelled) return;
      setSummary(e.payload);
    });
    unlistens.push(summaryUnlisten);

    const progressUnlisten = await listen<{bytes: number; done?: boolean}>('iptv-download-progress', (e) => {
      if (cancelled) return;
      setDownloadBytes(e.payload.bytes);
    });
    unlistens.push(progressUnlisten);

    try {
      const total = await invoke<number>('fetch_iptv_channels_chunked', { url: IPTV_URL });
      if (!cancelled) {
        setTotalToLoad(total);
        setDownloadProgress(1);
        setLoading(false);
      }
    } catch (e) {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    }
  };

  const refresh = useCallback(async () => {
    await invoke('clear_iptv_cache');
    setChannels([]);
    setSummary(null);
    setBatchesReceived(0);
    setDownloadProgress(0);
    const unlistens: UnlistenFn[] = [];
    await loadChannels(unlistens, false);
  }, []);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Volume control
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume, nowPlaying]);

  const playChannel = (channel: IptvChannel) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setNowPlaying(channel);
    setStreamError(null);
    setIsPlaying(false);
    setShowPlayer(true);

    const video = videoRef.current;
    if (!video) return;

    const url = channel.url;
    const isHls = url.includes('.m3u8') || url.includes('m3u8');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        maxLoadingDelay: 4,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 10000,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          // Try to recover if possible
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Attempt recovery: switch to next level or reload
            if (hls.levels.length > 1) {
              hls.nextLevel = (hls.currentLevel + 1) % hls.levels.length;
              // Some streams have multiple quality levels; try the next one
            } else {
              hls.startLoad(data.details !== Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR ? -1 : 0);
            }
            hls.recoverMediaError();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setStreamError('Stream unavailable, geo-blocked, or offline');
            hls.destroy();
            hlsRef.current = null;
          }
        }
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().then(() => setIsPlaying(true)).catch(() => {
        setStreamError('Playback failed');
      });
    } else {
      // Check if it's a direct stream (MP4, etc.)
      const isDirectStream = /\.(mp4|webm|ogg|avi|mkv)(\?.*)?$/i.test(url);
      if (isDirectStream) {
        video.src = url;
        video.play().then(() => setIsPlaying(true)).catch(() => {
          setStreamError('Direct stream not supported in browser');
        });
      } else {
        video.src = url;
        video.play().then(() => setIsPlaying(true)).catch(() => {
          setStreamError('Stream format not supported');
        });
      }
    }
  };

  const stopPlaying = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setNowPlaying(null);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter + sort
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    let result = channels;

    if (tab === 'favorites') {
      result = result.filter(c => favorites.has(c.id));
    }
    if (selectedCategory) {
      result = result.filter(c => c.primary_category === selectedCategory || c.categories.includes(selectedCategory));
    }
    if (selectedCountry) {
      result = result.filter(c => c.country_code === selectedCountry);
    }
    if (selectedRegion) {
      result = result.filter(c => c.region === selectedRegion);
    }
    if (selectedLanguage) {
      result = result.filter(c => c.language === selectedLanguage);
    }
    if (q) {
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.country || '').toLowerCase().includes(q) ||
        (c.language || '').toLowerCase().includes(q) ||
        (c.primary_category || '').toLowerCase().includes(q)
      );
    }

    if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [channels, tab, debouncedSearch, selectedCategory, selectedCountry, selectedRegion, selectedLanguage, sortBy, favorites]);

  const totalChannels = channels.length;

  // Tab counts
  const tabCounts = useMemo(() => {
    if (!summary) return { all: 0, category: 0, country: 0, region: 0, language: 0, favorites: favorites.size };
    return {
      all: summary.total,
      category: summary.by_category.reduce((s, c) => s + c.count, 0),
      country: summary.by_country.reduce((s, c) => s + c.count, 0),
      region: summary.by_region.reduce((s, r) => s + r.count, 0),
      language: summary.by_language.reduce((s, l) => s + l.count, 0),
      favorites: favorites.size,
    };
  }, [summary, favorites]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: tvStyles.bg }}>
      {/* Top Bar - now playing */}
      {nowPlaying && (
        <div className="px-4 py-2.5 flex items-center gap-3 shrink-0" style={{ backgroundColor: tvStyles.panel, borderBottom: `1px solid ${tvStyles.border}` }}>
          <button onClick={stopPlaying} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-400 hover:text-white shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {nowPlaying.logo && (
            <img
              src={nowPlaying.logo}
              alt=""
              className="w-9 h-9 rounded-xl object-contain shrink-0 grayscale"
              style={{ backgroundColor: tvStyles.panel }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{nowPlaying.name}</p>
            <p className="text-[11px] text-zinc-500 truncate">
              {countryFlag(nowPlaying.country_code)} {nowPlaying.country || 'Unknown'} · {nowPlaying.primary_category || 'General'}
              {nowPlaying.quality && ` · ${nowPlaying.quality}`}
            </p>
          </div>
          {streamError && (
            <span className="text-[11px] text-red-400 flex items-center gap-1 shrink-0">
              <Wifi className="w-3 h-3" /> {streamError}
            </span>
          )}
          <button onClick={togglePlay} className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors shrink-0">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Filter Navigation */}
        <div className="w-64 flex flex-col shrink-0 overflow-hidden" style={{ backgroundColor: tvStyles.panel, borderRight: `1px solid ${tvStyles.border}` }}>
          {/* Collapsible sidebar sections */}
          <SidebarSection title="Browse" defaultOpen={true} tab={tab} onTab={(t) => { setTab(t); setSelectedCategory(null); setSelectedCountry(null); setSelectedRegion(null); setSelectedLanguage(null); }} items={[
            { id: 'discover', label: 'Discover', icon: Radio },
            { id: 'all', label: 'All Channels', icon: Tv },
          ]} />
          <SidebarSection title="Filter" defaultOpen={true} tab={tab} onTab={(t) => { setTab(t); setSelectedCategory(null); setSelectedCountry(null); setSelectedRegion(null); setSelectedLanguage(null); }} items={[
            { id: 'category', label: 'Category', icon: Filter },
            { id: 'country', label: 'Country', icon: Globe },
            { id: 'region', label: 'Region', icon: Globe },
            { id: 'language', label: 'Language', icon: Volume2 },
          ]} />
          <SidebarSection title="Library" defaultOpen={true} tab={tab} onTab={(t) => { setTab(t); setSelectedCategory(null); setSelectedCountry(null); setSelectedRegion(null); setSelectedLanguage(null); }} items={[
            { id: 'favorites', label: `Favorites`, icon: Star, badge: favorites.size },
            { id: 'playlists', label: 'My Playlists', icon: List },
          ]} />

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {tab === 'discover' && summary && (
              <DiscoverPanel
                summary={summary}
                totalChannels={totalChannels}
                onSelectCountry={(code) => { setTab('all'); setSelectedCountry(code); }}
                onSelectCategory={(cat) => { setTab('all'); setSelectedCategory(cat); }}
                onSelectRegion={(reg) => { setTab('all'); setSelectedRegion(reg); }}
                onShowAll={() => setTab('all')}
              />
            )}

            {tab === 'all' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">All Channels</h3>
                  <button
                    onClick={refresh}
                    className="p-1 hover:bg-white/[0.06] rounded text-zinc-500 hover:text-zinc-300"
                    title="Refresh"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[12px] text-zinc-500 leading-relaxed">
                  Browse all {totalChannels.toLocaleString()} channels from {summary?.by_country.length || 0} countries.
                </p>
              </div>
            )}

            {tab === 'category' && summary && (
              <div className="p-2 space-y-0.5">
                <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-1.5 py-1">Category</h3>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-1.5 ${
                    !selectedCategory ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span className="flex-1">All Categories</span>
                  <span className="text-[10px] text-zinc-600">{tabCounts.category.toLocaleString()}</span>
                </button>
                {summary.by_category.map(cat => {
                  const meta = CATEGORY_META[cat.name] || CATEGORY_META.Other;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={cat.name}
                      onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-1.5 ${
                        selectedCategory === cat.name ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
                      }`}
                      title={meta.description}
                    >
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      <span className="flex-1">{cat.name}</span>
                      <span className="text-[10px] text-zinc-600">{cat.count.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {tab === 'country' && summary && (
              <div className="p-2 space-y-0.5">
                <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-1.5 py-1">Countries</h3>
                <button
                  onClick={() => setSelectedCountry(null)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-1.5 ${
                    !selectedCountry ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="flex-1">All Countries</span>
                  <span className="text-[10px] text-zinc-600">{tabCounts.country.toLocaleString()}</span>
                </button>
                {summary.by_country.map(c => (
                  <button
                    key={c.code}
                    onClick={() => setSelectedCountry(selectedCountry === c.code ? null : c.code)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-1.5 ${
                      selectedCountry === c.code ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="text-base w-5 text-center">{countryFlag(c.code)}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-[10px] text-zinc-600">{c.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'region' && summary && (
              <div className="p-2 space-y-1">
                <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-1.5 py-1">Regions</h3>
                <button
                  onClick={() => setSelectedRegion(null)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-1.5 ${
                    !selectedRegion ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="flex-1">All Regions</span>
                  <span className="text-[10px] text-zinc-600">{tabCounts.region.toLocaleString()}</span>
                </button>
                {summary.by_region.map(r => (
                  <RegionSection
                    key={r.name}
                    region={r}
                    selectedCountry={selectedCountry}
                    onSelectCountry={setSelectedCountry}
                  />
                ))}
              </div>
            )}

            {tab === 'language' && summary && (
              <div className="p-2 space-y-0.5">
                <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-1.5 py-1">Languages</h3>
                <button
                  onClick={() => setSelectedLanguage(null)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-1.5 ${
                    !selectedLanguage ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span className="flex-1">All Languages</span>
                  <span className="text-[10px] text-zinc-600">{tabCounts.language.toLocaleString()}</span>
                </button>
                {summary.by_language.map(l => (
                  <button
                    key={l.name}
                    onClick={() => setSelectedLanguage(selectedLanguage === l.name ? null : l.name)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors ${
                      selectedLanguage === l.name ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="flex-1">{l.name}</span>
                    <span className="text-[10px] text-zinc-600">{l.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'favorites' && (
              <div className="p-3">
                <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Favorites</h3>
                <p className="text-[12px] text-zinc-500 leading-relaxed mb-2">
                  {favorites.size} channel{favorites.size !== 1 ? 's' : ''} saved.
                </p>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Click the star icon on any channel to add it to your favorites.
                </p>
              </div>
            )}

            {tab === 'playlists' && (
              <PlaylistManager onImported={(url, entries, countryCode) => {
                // Merge imported channels into the main list
                const newChannels: IptvChannel[] = entries.map((e, i) => ({
                  id: `custom_${Date.now()}_${i}`,
                  name: e.name || url,
                  url: e.url,
                  logo: e.logo || null,
                  group: e.group || null,
                  categories: [],
                  primary_category: null,
                  country: countryCode || null,
                  country_code: countryCode || null,
                  region: null,
                  language: null,
                  quality: null,
                  tvg_id: e.tvg_id || null,
                }));
                setChannels(prev => {
                  const seen = new Set(prev.map(c => c.id));
                  const deduped = newChannels.filter(c => !seen.has(c.id));
                  return [...prev, ...deduped];
                });
                setTab('all');
              }} />
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Search + Controls */}
          <div className="p-4 flex items-center gap-3 shrink-0 flex-wrap" style={{ borderBottom: `1px solid ${tvStyles.border}` }}>
            {/* Filter dropdowns */}
            {tab !== 'discover' && summary && (
              <div className="flex items-center gap-2">
                <Select value={selectedCategory || 'all'} onValueChange={(v) => { setSelectedCategory(v === 'all' ? null : v); setTab('all'); }}>
                  <SelectTrigger className="h-[48px] px-3 rounded-xl text-[13px] w-auto min-w-[120px]" style={{ backgroundColor: tvStyles.card, border: `1px solid ${tvStyles.border}` }}>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Category</SelectItem>
                    {summary.by_category.map(c => <SelectItem key={c.name} value={c.name}>{c.name} ({c.count})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedCountry || 'all'} onValueChange={(v) => { setSelectedCountry(v === 'all' ? null : v); setTab('all'); }}>
                  <SelectTrigger className="h-[48px] px-3 rounded-xl text-[13px] w-auto min-w-[120px]" style={{ backgroundColor: tvStyles.card, border: `1px solid ${tvStyles.border}` }}>
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Country</SelectItem>
                    {summary.by_country.map(c => <SelectItem key={c.code} value={c.code}>{c.name} ({c.count})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedRegion || 'all'} onValueChange={(v) => { setSelectedRegion(v === 'all' ? null : v); setTab('all'); }}>
                  <SelectTrigger className="h-[48px] px-3 rounded-xl text-[13px] w-auto min-w-[120px]" style={{ backgroundColor: tvStyles.card, border: `1px solid ${tvStyles.border}` }}>
                    <SelectValue placeholder="Region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Region</SelectItem>
                    {summary.by_region.map(r => <SelectItem key={r.name} value={r.name}>{r.name} ({r.count})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedLanguage || 'all'} onValueChange={(v) => { setSelectedLanguage(v === 'all' ? null : v); setTab('all'); }}>
                  <SelectTrigger className="h-[48px] px-3 rounded-xl text-[13px] w-auto min-w-[120px]" style={{ backgroundColor: tvStyles.card, border: `1px solid ${tvStyles.border}` }}>
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Language</SelectItem>
                    {summary.by_language.map(l => <SelectItem key={l.name} value={l.name}>{l.name} ({l.count})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search channels, countries, languages..."
                className="w-full h-[48px] rounded-xl pl-11 pr-4 text-[14px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-shadow"
                style={{ backgroundColor: tvStyles.card, border: `1px solid ${tvStyles.border}` }}
              />
            </div>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="h-[48px] px-3 rounded-xl text-[13px] w-auto min-w-[120px]" style={{ backgroundColor: tvStyles.card, border: `1px solid ${tvStyles.border}` }}>
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
                <SelectItem value="recent">Recently loaded</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center rounded-xl p-0.5" style={{ backgroundColor: tvStyles.card, border: `1px solid ${tvStyles.border}` }}>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white/[0.08] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                title="Grid view"
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white/[0.08] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 h-[48px] px-2">
              <Tv className="w-4 h-4 opacity-60" />
              <span className="font-mono tabular-nums text-zinc-400">{filtered.length.toLocaleString()}</span>
              <span className="text-zinc-700">/</span>
              <span className="font-mono tabular-nums text-zinc-600">{totalChannels.toLocaleString()}</span>
            </div>
          </div>

          {/* Active filters bar */}
          {(selectedCategory || selectedCountry || selectedRegion || selectedLanguage || debouncedSearch) && (
            <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap text-[11px]" style={{ borderBottom: `1px solid ${tvStyles.border}` }}>
              {selectedCategory && (
                <FilterChip onClear={() => setSelectedCategory(null)}>
                  {CATEGORY_META[selectedCategory]?.icon && (
                    <span className={`${CATEGORY_META[selectedCategory].color}`}>
                      {(() => {
                        const I = CATEGORY_META[selectedCategory].icon;
                        return <I className="w-3 h-3" />;
                      })()}
                    </span>
                  )}
                  {selectedCategory}
                </FilterChip>
              )}
              {selectedCountry && (
                <FilterChip onClear={() => setSelectedCountry(null)}>
                  {countryFlag(selectedCountry)} {selectedCountry}
                </FilterChip>
              )}
              {selectedRegion && (
                <FilterChip onClear={() => setSelectedRegion(null)}>
                  {regionFlag(selectedRegion)} {REGIONS[selectedRegion] || selectedRegion}
                </FilterChip>
              )}
              {selectedLanguage && (
                <FilterChip onClear={() => setSelectedLanguage(null)}>
                  {selectedLanguage}
                </FilterChip>
              )}
              {debouncedSearch && (
                <FilterChip onClear={() => setSearch('')}>
                  Search: "{debouncedSearch}"
                </FilterChip>
              )}
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedCountry(null);
                  setSelectedRegion(null);
                  setSelectedLanguage(null);
                  setSearch('');
                }}
                className="text-zinc-500 hover:text-zinc-300 ml-1"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Channel grid/list */}
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <LoadingState bytes={downloadBytes} progress={downloadProgress} total={totalToLoad} loaded={totalChannels} />
            ) : error ? (
              <ErrorState error={error} onRetry={refresh} />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <Tv className="w-12 h-12 text-zinc-700" />
                <p className="text-sm text-zinc-400">No channels match your filters</p>
                {favorites.size === 0 && tab === 'favorites' && (
                  <p className="text-xs text-zinc-600">Click the ★ icon to add channels to favorites</p>
                )}
              </div>
            ) : tab === 'discover' && !selectedCategory && !selectedCountry && !selectedRegion && !selectedLanguage && !debouncedSearch ? (
              <DiscoverMainView
                summary={summary}
                channels={channels}
                nowPlaying={nowPlaying}
                favorites={favorites}
                onSelectCountry={(code) => setSelectedCountry(code)}
                onSelectCategory={(cat) => setSelectedCategory(cat)}
                onPlay={playChannel}
                onToggleFavorite={toggleFavorite}
                onSwitchToAll={() => setTab('all')}
              />
            ) : viewMode === 'grid' ? (
              <ChannelGrid
                channels={filtered}
                nowPlaying={nowPlaying}
                favorites={favorites}
                onPlay={playChannel}
                onToggleFavorite={toggleFavorite}
              />
            ) : (
              <ChannelList
                channels={filtered}
                nowPlaying={nowPlaying}
                favorites={favorites}
                onPlay={playChannel}
                onToggleFavorite={toggleFavorite}
              />
            )}
          </div>
        </div>
      </div>

      {/* Video Player */}
      {nowPlaying && showPlayer && (
        <div className="relative bg-black shrink-0">
          <button
            onClick={() => setShowPlayer(false)}
            className="absolute top-2 right-2 z-10 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
            title="Hide player"
          >
            <X className="w-4 h-4" />
          </button>
          <video
            ref={videoRef}
            className="w-full"
            style={{ maxHeight: '40vh' }}
            controls
            playsInline
            autoPlay
          />
        </div>
      )}
      {nowPlaying && !showPlayer && (
        <button
          onClick={() => setShowPlayer(true)}
          className="h-9 w-full text-indigo-300 text-xs font-medium transition-colors shrink-0"
          style={{ backgroundColor: 'rgba(99,102,241,0.1)' }}
        >
          Show player
        </button>
      )}
    </div>
  );
}

// ============== Sub Components ==============

function SidebarSection({ title, defaultOpen, tab, onTab, items }: {
  title: string;
  defaultOpen: boolean;
  tab: TabType;
  onTab: (t: TabType) => void;
  items: Array<{ id: TabType; label: string; icon: any; badge?: number }>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="px-2 pt-3 pb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {title}
      </button>
      {open && (
        <div className="space-y-0.5">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onTab(item.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] transition-all duration-150 flex items-center gap-2 ${
                  tab === item.id
                    ? 'bg-indigo-500/15 text-indigo-300 font-medium'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                }`}
              >
                <Icon className="w-4 h-4 opacity-70" />
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="text-[10px] font-mono tabular-nums text-zinc-600">{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
      {children}
      <button onClick={onClear} className="hover:text-white">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function RegionSection({
  region,
  selectedCountry,
  onSelectCountry,
}: {
  region: RegionGroup;
  selectedCountry: string | null;
  onSelectCountry: (code: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = region.countries.some(c => c.code === selectedCountry);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors flex items-center gap-1.5 ${
          isActive ? 'bg-indigo-500/10 text-indigo-300' : 'text-zinc-300 hover:bg-white/[0.03]'
        }`}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="text-sm">{regionFlag(region.name)}</span>
        <span className="flex-1 font-medium">{REGIONS[region.name] || region.name}</span>
        <span className="text-[10px] text-zinc-600">{region.count.toLocaleString()}</span>
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 pl-1" style={{ borderLeft: `1px solid ${tvStyles.border}` }}>
          {region.countries.map(c => (
            <button
              key={c.code}
              onClick={() => onSelectCountry(selectedCountry === c.code ? null : c.code)}
              className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors flex items-center gap-1.5 ${
                selectedCountry === c.code ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:bg-white/[0.03]'
              }`}
            >
              <span className="text-sm w-4 text-center">{countryFlag(c.code)}</span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-[10px] text-zinc-600">{c.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingState({
  bytes, progress, total, loaded,
}: { bytes: number; progress: number; total: number; loaded: number }) {
  const kb = (bytes / 1024).toFixed(0);
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400 p-8">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
      <div className="text-center space-y-1">
        <p className="text-base font-medium text-zinc-200">Loading TV channels...</p>
        <p className="text-[12px] text-zinc-500">
          Downloaded {kb} KB · Loaded {loaded.toLocaleString()} / {total.toLocaleString()} channels
        </p>
      </div>
      <div className="w-80 max-w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200"
          style={{ width: `${Math.max(2, progress * 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-700">
        Channels stream in as they're parsed — no full load wait
      </p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400 p-8">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-base font-medium text-red-300">Failed to load channels</p>
      <p className="text-[12px] text-zinc-500 max-w-md text-center">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm rounded-lg transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function ChannelGrid({
  channels, nowPlaying, favorites, onPlay, onToggleFavorite,
}: {
  channels: IptvChannel[];
  nowPlaying: IptvChannel | null;
  favorites: Set<string>;
  onPlay: (c: IptvChannel) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <ResponsiveChannelGrid
      channels={channels}
      nowPlaying={nowPlaying}
      favorites={favorites}
      onPlay={onPlay}
      onToggleFavorite={onToggleFavorite}
    />
  );
}

function ResponsiveChannelGrid({
  channels, nowPlaying, favorites, onPlay, onToggleFavorite,
}: {
  channels: IptvChannel[];
  nowPlaying: IptvChannel | null;
  favorites: Set<string>;
  onPlay: (c: IptvChannel) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(5);
  const [itemHeight, setItemHeight] = useState(220);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      let next = 6;
      if (w < 480) next = 2;
      else if (w < 720) next = 3;
      else if (w < 960) next = 4;
      else if (w < 1280) next = 5;
      else if (w < 1600) next = 6;
      else next = 7;
      setCols(next);
      setItemHeight(Math.ceil((w - 16 - (next - 1) * 8) / next) * 0.75 + 44);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rowCount = Math.ceil(channels.length / cols);
  const ROW_HEIGHT = itemHeight + 8;
  return (
    <div ref={containerRef} className="h-full">
      <VirtualList
        items={Array.from({ length: rowCount }, (_, i) => i)}
        itemHeight={ROW_HEIGHT}
        keyExtractor={(i) => `row-${i}`}
        className="h-full"
        renderItem={(rowIdx) => {
          const start = rowIdx * cols;
          const rowItems = channels.slice(start, start + cols);
          return (
            <div className="grid px-2 gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {rowItems.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  isPlaying={nowPlaying?.id === channel.id}
                  isFavorite={favorites.has(channel.id)}
                  onPlay={() => onPlay(channel)}
                  onToggleFavorite={(e) => onToggleFavorite(channel.id, e)}
                />
              ))}
            </div>
          );
        }}
      />
    </div>
  );
}

function ChannelCard({
  channel, isPlaying, isFavorite, onPlay, onToggleFavorite,
}: {
  channel: IptvChannel;
  isPlaying: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const [logoError, setLogoError] = useState(false);
  const subtitle = [
    channel.country ? `${countryFlag(channel.country_code || '')} ${channel.country}` : null,
    channel.primary_category || null,
    channel.quality || null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="px-2 py-1.5">
      <button
        onClick={onPlay}
        className={`group relative w-full flex flex-col rounded-2xl overflow-hidden transition-all duration-200 text-left ${
          isPlaying
            ? 'ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/10'
            : 'hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30'
        }`}
        style={{
          backgroundColor: isPlaying ? 'rgba(99,102,241,0.1)' : tvStyles.card,
        }}
      >
        <div className="relative w-full h-[120px] flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: tvStyles.panel }}>
          {channel.logo && !logoError ? (
            <img
              src={channel.logo}
              alt={channel.name}
              className="w-full h-full object-contain p-5 grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-300"
              loading="lazy"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Tv className="w-10 h-10" />
            </div>
          )}
          {isPlaying && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-lg backdrop-blur-sm"
              style={{ backgroundColor: 'rgba(99,102,241,0.9)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] font-bold text-white tracking-wider">LIVE</span>
            </div>
          )}
          {channel.quality && !isPlaying && (
            <span className="absolute top-2 right-2 text-[10px] font-mono font-semibold text-emerald-400 px-2 py-0.5 rounded-lg backdrop-blur-sm"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
              {channel.quality}
            </span>
          )}
          <button
            onClick={onToggleFavorite}
            className={`absolute bottom-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
              isFavorite
                ? 'bg-amber-500/90 text-white'
                : 'opacity-0 group-hover:opacity-100 text-zinc-300'
            }`}
            style={{ backgroundColor: isFavorite ? undefined : 'rgba(0,0,0,0.5)' }}
            aria-label="Toggle favorite"
          >
            <Star className="w-3.5 h-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
            <div className="flex items-center gap-1.5 text-white text-xs font-medium">
              <Play className="w-4 h-4 fill-current" />
              <span>Play</span>
            </div>
          </div>
        </div>
        <div className="px-3 py-2.5">
          <h3 className="text-xs font-semibold text-zinc-100 truncate group-hover:text-white">
            {channel.name}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </button>
    </div>
  );
}

function ChannelList({
  channels, nowPlaying, favorites, onPlay, onToggleFavorite,
}: {
  channels: IptvChannel[];
  nowPlaying: IptvChannel | null;
  favorites: Set<string>;
  onPlay: (c: IptvChannel) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
}) {
  const ITEM_HEIGHT = 56;
  return (
    <VirtualList
      items={channels}
      itemHeight={ITEM_HEIGHT}
      keyExtractor={(c) => c.id}
      className="h-full"
      renderItem={(channel) => (
        <ChannelRow
          channel={channel}
          isPlaying={nowPlaying?.id === channel.id}
          isFavorite={favorites.has(channel.id)}
          onPlay={() => onPlay(channel)}
          onToggleFavorite={(e) => onToggleFavorite(channel.id, e)}
        />
      )}
    />
  );
}

function ChannelRow({
  channel, isPlaying, isFavorite, onPlay, onToggleFavorite,
}: {
  channel: IptvChannel;
  isPlaying: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const [logoError, setLogoError] = useState(false);
  return (
    <div className="px-3 py-0.5">
      <button
        onClick={onPlay}
        className={`group w-full h-[48px] flex items-center gap-3 px-3 py-1.5 rounded-xl transition-all duration-150 text-left ${
          isPlaying
            ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
            : 'hover:bg-white/[0.03]'
        }`}
      >
        {channel.logo && !logoError ? (
          <img
            src={channel.logo}
            alt=""
            className="w-9 h-9 rounded-xl object-contain shrink-0 grayscale group-hover:grayscale-0 transition-all duration-300"
            style={{ backgroundColor: tvStyles.panel }}
            loading="lazy"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 shrink-0"
            style={{ backgroundColor: tvStyles.panel }}>
            <Tv className="w-4 h-4" />
          </div>
        )}
        <span className="text-sm">{countryFlag(channel.country_code)}</span>
        <p className="text-[13px] text-zinc-200 truncate flex-1">{channel.name}</p>
        {channel.primary_category && (
          <span className="text-[11px] text-zinc-500 hidden sm:inline">{channel.primary_category}</span>
        )}
        {channel.quality && (
          <span className="text-[11px] font-mono text-emerald-500/80 w-8 text-right">{channel.quality}</span>
        )}
        <button
          onClick={onToggleFavorite}
          className={`p-1 rounded transition-colors ${
            isFavorite ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Star className="w-3 h-3" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </button>
    </div>
  );
}

// ============== Discover Panel (Public Landing) ==============

function DiscoverPanel({
  summary, totalChannels, onSelectCountry, onSelectCategory, onSelectRegion, onShowAll,
}: {
  summary: ChannelSummary;
  totalChannels: number;
  onSelectCountry: (code: string) => void;
  onSelectCategory: (cat: string) => void;
  onSelectRegion: (reg: string) => void;
  onShowAll: () => void;
}) {
  // Pick top 20 popular countries that have data
  const popularCountries = POPULAR_COUNTRY_CODES
    .map(code => summary.by_country.find(c => c.code === code))
    .filter((c): c is CountryGroup => c != null)
    .slice(0, 20);

  // If curated list is empty (data not loaded), fall back to top 20 by count
  const fallbackCountries = popularCountries.length > 0
    ? popularCountries
    : summary.by_country.slice(0, 20);

  const topCategories = summary.by_category.slice(0, 8);
  const topRegions = summary.by_region.slice(0, 6);

  return (
    <div className="p-4 space-y-6">
      {/* Hero / Stats — big numbers like GitHub/Steam */}
      <div className="rounded-xl p-4" style={{ backgroundColor: tvStyles.card }}>
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live TV · Public Catalog</h3>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed mb-4">
          Browse <span className="text-white font-semibold">{totalChannels.toLocaleString()}</span> free
          public channels from <span className="text-white font-semibold">{summary.by_country.length}</span> countries,
          powered by the open <a href="https://iptv-org.github.io" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5">iptv-org catalog<ExternalLink className="w-3 h-3" /></a>.
        </p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">{totalChannels.toLocaleString()}</p>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider mt-0.5">Channels</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">{summary.by_country.length}</p>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider mt-0.5">Countries</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">{summary.by_category.length}</p>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider mt-0.5">Categories</p>
          </div>
        </div>
      </div>

      {/* Popular Countries */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Popular
          </h3>
          <button
            onClick={onShowAll}
            className="text-[11px] text-indigo-400 hover:text-indigo-300"
          >
            See all →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {fallbackCountries.map(c => (
            <button
              key={c.code}
              onClick={() => onSelectCountry(c.code)}
              className="text-left px-2.5 py-2 rounded-xl text-xs transition-all hover:-translate-y-0.5 flex items-center gap-2"
              style={{ backgroundColor: tvStyles.card }}
            >
              <span className="text-lg">{countryFlag(c.code)}</span>
              <span className="flex-1 truncate text-zinc-200">{c.name}</span>
              <span className="text-[11px] text-zinc-500 tabular-nums">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Top Categories */}
      {topCategories.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> Categories
          </h3>
          <div className="space-y-1">
            {topCategories.map(cat => {
              const meta = CATEGORY_META[cat.name] || CATEGORY_META.Other;
              const Icon = meta.icon;
              return (
                <button
                  key={cat.name}
                  onClick={() => onSelectCategory(cat.name)}
                  className="w-full text-left px-2.5 py-2 rounded-xl text-xs transition-all hover:-translate-y-0.5 flex items-center gap-2"
                  style={{ backgroundColor: tvStyles.card }}
                  title={cat.description}
                >
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                  <span className="flex-1 text-zinc-200">{cat.name}</span>
                  <span className="text-[11px] text-zinc-500 tabular-nums">{cat.count.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Browse by Region */}
      {topRegions.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" /> Regions
          </h3>
          <div className="space-y-1">
            {topRegions.map(r => (
              <button
                key={r.name}
                onClick={() => onSelectRegion(r.name)}
                className="w-full text-left px-2.5 py-2 rounded-xl text-xs transition-all hover:-translate-y-0.5 flex items-center gap-2"
                style={{ backgroundColor: tvStyles.card }}
              >
                <span className="text-sm">{regionFlag(r.name)}</span>
                <span className="flex-1 text-zinc-200">{REGIONS[r.name] || r.name}</span>
                <span className="text-[11px] text-zinc-500 tabular-nums">{r.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attribution */}
      <div className="pt-3 text-[10px] text-zinc-600 leading-relaxed" style={{ borderTop: `1px solid ${tvStyles.border}` }}>
        Channel streams sourced from{' '}
        <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer" className="text-indigo-400/80 hover:text-indigo-300">
          iptv-org
        </a>
        . Logos are property of their respective broadcasters.
      </div>
    </div>
  );
}

// ============== Discover Main View (full-area public browse) ==============

function DiscoverMainView({
  summary, channels, nowPlaying, favorites,
  onSelectCountry, onSelectCategory, onPlay, onToggleFavorite, onSwitchToAll,
}: {
  summary: ChannelSummary | null;
  channels: IptvChannel[];
  nowPlaying: IptvChannel | null;
  favorites: Set<string>;
  onSelectCountry: (code: string) => void;
  onSelectCategory: (cat: string) => void;
  onPlay: (c: IptvChannel) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onSwitchToAll: () => void;
}) {
  if (!summary) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  // Pick popular countries that have channels
  const popularCountries = POPULAR_COUNTRY_CODES
    .map(code => summary.by_country.find(c => c.code === code))
    .filter((c): c is CountryGroup => c != null);

  // Pick sample channels per popular country (for visual preview)
  const channelsByCountry = new Map<string, IptvChannel[]>();
  for (const c of channels) {
    if (c.country_code) {
      const arr = channelsByCountry.get(c.country_code) || [];
      arr.push(c);
      channelsByCountry.set(c.country_code, arr);
    }
  }

  const StatBlock = ({ value, label }: { value: string | number; label: string }) => (
    <div className="text-center">
      <p className="text-3xl font-bold text-white tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-7xl mx-auto p-8 space-y-10" style={{ backgroundColor: tvStyles.bg }}>
        {/* Hero — big numbers focal point */}
        <section>
          <div className="rounded-2xl p-8" style={{ backgroundColor: tvStyles.card }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-indigo-500/15 text-indigo-400">
                <Radio className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Live TV · Public Catalog</span>
                <h1 className="text-3xl font-bold text-white mt-1">Watch TV from around the world</h1>
              </div>
            </div>
            <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed mb-6">
              Browse <span className="text-white font-semibold">{summary.total.toLocaleString()}</span> free
              public channels from <span className="text-white font-semibold">{summary.by_country.length}</span> countries.
              All channels are streamed from publicly listed sources, courtesy of the open{' '}
              <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5">
                iptv-org catalog <ExternalLink className="w-3 h-3" />
              </a>.
            </p>
            <div className="flex items-center gap-8 flex-wrap">
              <StatBlock value={summary.total} label="Channels" />
              <StatBlock value={summary.by_country.length} label="Countries" />
              <StatBlock value={summary.by_category.length} label="Categories" />
              <StatBlock value={summary.by_language.length} label="Languages" />
              <button
                onClick={onSwitchToAll}
                className="ml-auto px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-indigo-500/25 flex items-center gap-1.5"
              >
                <Grid3x3 className="w-4 h-4" /> Browse all channels
              </button>
            </div>
          </div>
        </section>

        {/* Country tiles */}
        {popularCountries.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" /> Browse by Country
              </h2>
              <span className="text-xs text-zinc-500">{popularCountries.length} featured · {summary.by_country.length} total</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {popularCountries.map(country => {
                const sample = (channelsByCountry.get(country.code) || []).slice(0, 6);
                return (
                  <button
                    key={country.code}
                    onClick={() => onSelectCountry(country.code)}
                    className="group relative flex flex-col rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30"
                    style={{ backgroundColor: tvStyles.card }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl">{countryFlag(country.code)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-white truncate group-hover:text-indigo-200 transition-colors">{country.name}</p>
                        <p className="text-xs text-zinc-500 tabular-nums mt-0.5">{country.count.toLocaleString()} channels</p>
                      </div>
                    </div>
                    {sample.length > 0 && (
                      <div className="flex -space-x-2.5 h-10 items-center">
                        {sample.map(ch => (
                          <div
                            key={ch.id}
                            className="w-10 h-10 rounded-xl overflow-hidden shrink-0 ring-2 ring-[#0D1117] transition-all hover:scale-110 hover:z-10 hover:-translate-y-1"
                            style={{ backgroundColor: tvStyles.panel }}
                            title={ch.name}
                          >
                            {ch.logo ? (
                              <img
                                src={ch.logo}
                                alt={ch.name}
                                className="w-full h-full object-contain p-1 grayscale group-hover:grayscale-0 transition-all duration-300"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Tv className="w-4 h-4 text-zinc-600" />
                              </div>
                            )}
                          </div>
                        ))}
                        {country.count > sample.length && (
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs text-zinc-500 font-mono shrink-0"
                            style={{ backgroundColor: tvStyles.panel }}>
                            +{country.count - sample.length}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Category section */}
        {summary.by_category.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" /> Browse by Category
              </h2>
              <span className="text-xs text-zinc-500">{summary.by_category.length} kinds</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {summary.by_category.slice(0, 12).map(cat => {
                const meta = CATEGORY_META[cat.name] || CATEGORY_META.Other;
                const Icon = meta.icon;
                return (
                  <button
                    key={cat.name}
                    onClick={() => onSelectCategory(cat.name)}
                    className="group flex flex-col items-start gap-3 p-4 rounded-2xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30 text-left"
                    style={{ backgroundColor: tvStyles.card }}
                    title={cat.description}
                  >
                    <div className="p-2.5 rounded-xl transition-colors" style={{ backgroundColor: tvStyles.panel }}>
                      <Icon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors">{cat.name}</p>
                      <p className="text-xs text-zinc-500 tabular-nums mt-0.5">{cat.count.toLocaleString()} channels</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Featured channels — fixed card heights, grayscale logos */}
        {channels.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" /> Featured Channels
              </h2>
              <button
                onClick={onSwitchToAll}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
              >
                Browse all {summary.total.toLocaleString()} <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {channels.slice(0, 24).map(channel => (
                <button
                  key={channel.id}
                  onClick={() => onPlay(channel)}
                  className={`group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-200 text-left ${
                    nowPlaying?.id === channel.id
                      ? 'ring-2 ring-indigo-500/50'
                      : 'hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30'
                  }`}
                  style={{
                    backgroundColor: nowPlaying?.id === channel.id ? 'rgba(99,102,241,0.1)' : tvStyles.card,
                  }}
                >
                  <div className="relative w-full h-[120px] flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: tvStyles.panel }}>
                    {channel.logo ? (
                      <img
                        src={channel.logo}
                        alt={channel.name}
                        className="w-full h-full object-contain p-5 grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-300"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Tv className="w-10 h-10 text-zinc-600" />
                    )}
                    {channel.quality && (
                      <span className="absolute top-2 right-2 text-[10px] font-mono font-semibold text-emerald-400 px-2 py-0.5 rounded-lg backdrop-blur-sm"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                        {channel.quality}
                      </span>
                    )}
                    <button
                      onClick={(e) => onToggleFavorite(channel.id, e)}
                      className={`absolute bottom-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                        favorites.has(channel.id)
                          ? 'bg-amber-500/90 text-white'
                          : 'opacity-0 group-hover:opacity-100 text-zinc-300'
                      }`}
                      style={{ backgroundColor: favorites.has(channel.id) ? undefined : 'rgba(0,0,0,0.5)' }}
                    >
                      <Star className="w-3.5 h-3.5" fill={favorites.has(channel.id) ? 'currentColor' : 'none'} />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                      <div className="flex items-center gap-1.5 text-white text-xs font-medium">
                        <Play className="w-4 h-4 fill-current" />
                        <span>Play</span>
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <h3 className="text-xs font-semibold text-zinc-100 truncate group-hover:text-white">{channel.name}</h3>
                    <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                      {countryFlag(channel.country_code || '')} {channel.country || 'Unknown'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Attribution footer */}
        <footer className="pt-6 text-xs text-zinc-600 leading-relaxed" style={{ borderTop: `1px solid ${tvStyles.border}` }}>
          <p>
            Channel streams and metadata are sourced from{' '}
            <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">
              iptv-org
            </a>{' '}
            — a public, community-maintained catalog of free TV channels. Channel logos are the property of their respective broadcasters.
          </p>
        </footer>
      </div>
    </div>
  );
}

// ============== Playlist Manager (Custom M3U Sources) ==============

function PlaylistManager({ onImported }: {
  onImported: (url: string, entries: Array<{ name: string; url: string; logo: string | null; group: string | null; tvg_id: string | null }>, countryCode: string) => void;
}) {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const items = await listUserPlaylists();
      setPlaylists(items);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newUrl.trim() || !newName.trim()) return;
    try {
      const id = await addUserPlaylist(newName.trim(), newUrl.trim(), newCountry.trim().toUpperCase());
      setPlaylists(prev => [...prev, {
        id, name: newName.trim(), url: newUrl.trim(),
        country_code: newCountry.trim().toUpperCase(), enabled: true, created_at: new Date().toISOString()
      }]);
      setNewName(''); setNewUrl(''); setNewCountry('');
    } catch (e) { alert(String(e)); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUserPlaylist(id);
      setPlaylists(prev => prev.filter(p => p.id !== id));
    } catch (e) { alert(String(e)); }
  };

  const handleImport = async (p: UserPlaylist) => {
    setImporting(true);
    try {
      const entries = await importCustomM3u(p.url, p.country_code);
      if (entries.length === 0) { alert('No channels found in this playlist'); return; }
      onImported(p.url, entries, p.country_code);
    } catch (e) { alert(String(e)); }
    setImporting(false);
  };

  return (
    <div className="p-3 space-y-3">
      {/* Add new playlist form */}
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Add Playlist</h3>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Name (e.g. UK Sports)"
          className="w-full bg-zinc-900/50 border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
        />
        <input
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          placeholder="M3U URL"
          className="w-full bg-zinc-900/50 border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
        />
        <div className="flex gap-1.5">
          <input
            value={newCountry}
            onChange={e => setNewCountry(e.target.value.toUpperCase())}
            placeholder="Country code (e.g. US)"
            maxLength={2}
            className="flex-1 bg-zinc-900/50 border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 uppercase"
          />
          <button
            onClick={handleAdd}
            disabled={!newUrl.trim() || !newName.trim()}
            className="px-2.5 py-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-30 text-white text-[10px] font-medium rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Existing playlists */}
      <div>
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          My Playlists ({playlists.length})
        </h3>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        ) : playlists.length === 0 ? (
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Add your own M3U playlists to import custom channels.
          </p>
        ) : (
          <div className="space-y-1">
            {playlists.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-900/30 border border-white/[0.04] group hover:bg-zinc-900/60">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-zinc-200 font-medium truncate">{p.name}</p>
                  <p className="text-[9px] text-zinc-500 truncate">{p.url} {p.country_code && `· ${countryFlag(p.country_code)} ${p.country_code}`}</p>
                </div>
                <button
                  onClick={() => handleImport(p)}
                  disabled={importing}
                  className="p-1 rounded text-zinc-500 hover:text-indigo-300 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-all"
                  title="Import channels"
                >
                  <Download className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
