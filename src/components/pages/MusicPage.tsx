import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { buildProxyUrl } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, Music, Search, Download, Disc3, Headphones, 
  ChevronDown, ChevronUp, Mic2, Calendar, 
  ArrowRightLeft, ListMusic
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  album_artist?: string;
  track_number?: number;
  total_tracks?: number;
  year?: number;
  genre?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url: string;
  uploader: string;
  platform: string;
  quality_note?: string;
}

interface MusicCollection {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  webpage_url: string;
  tracks: MusicTrack[];
  platform: string;
  collection_type: 'album' | 'playlist' | 'ep' | 'single';
  year?: number;
}

interface MusicSearchResult {
  tracks: MusicTrack[];
  collections: MusicCollection[];
  query: string;
  platform: string;
}

interface MusicDownloadOptions {
  format_id: string;
  embed_thumbnail: boolean;
  embed_metadata: boolean;
  browser_for_cookies?: string | null;
  cookies_path?: string | null;
  write_lyrics: boolean;
  add_metadata: boolean;
  parse_metadata: boolean;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', maxQuality: '256kbps AAC' },
  { id: 'youtube_music', name: 'YouTube Music', maxQuality: '256kbps AAC' },
  { id: 'soundcloud', name: 'SoundCloud', maxQuality: '256kbps AAC' },
  { id: 'bandcamp', name: 'Bandcamp', maxQuality: 'FLAC Lossless' },
  { id: 'audiomack', name: 'Audiomack', maxQuality: '128kbps AAC' },
  { id: 'vimeo', name: 'Vimeo', maxQuality: '256kbps AAC' },
];

const FORMATS = [
  { id: 'best', name: 'Best', desc: 'Highest quality' },
  { id: 'flac', name: 'FLAC', desc: 'Lossless' },
  { id: 'opus', name: 'Opus', desc: '~160kbps' },
  { id: 'm4a', name: 'M4A', desc: '256kbps AAC' },
  { id: 'mp3_320', name: 'MP3 320', desc: '320kbps' },
  { id: 'mp3_256', name: 'MP3 256', desc: '256kbps' },
  { id: 'mp3_192', name: 'MP3 192', desc: '192kbps' },
  { id: 'mp3_128', name: 'MP3 128', desc: '128kbps' },
  { id: 'wav', name: 'WAV', desc: 'Uncompressed' },
];

export function MusicPage() {
  const pathMusic = useSettingsStore((state) => state.pathMusic);
  const pathGeneral = useSettingsStore((state) => state.pathGeneral);
  const browserForCookies = useSettingsStore((state) => state.browserForCookies);
  const cookiesPath = useSettingsStore((state) => state.cookiesPath);

  const [query, setQuery] = useState('');
  const [source, setSource] = useState('youtube_music');
  const [searching, setSearching] = useState(false);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [collections, setCollections] = useState<MusicCollection[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [collectionTracks, setCollectionTracks] = useState<MusicTrack[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(false);

  const [audioFormat, setAudioFormat] = useState('best');
  const [embedThumbnail, setEmbedThumbnail] = useState(true);
  const [embedMetadata, setEmbedMetadata] = useState(true);
  const [writeLyrics, setWriteLyrics] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [activeTab, setActiveTab] = useState<'tracks' | 'albums'>('tracks');
  const [mainView, setMainView] = useState<'search' | 'spotify'>('search');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [resolvingSpotify, setResolvingSpotify] = useState(false);
  const [customSaveDir, setCustomSaveDir] = useState('');

  const saveDir = customSaveDir || pathMusic || pathGeneral || '/tmp';

  useEffect(() => {
    setCustomSaveDir(pathMusic || pathGeneral || '/tmp');
  }, [pathMusic, pathGeneral]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setTracks([]);
    setCollections([]);
    setSelectedUrls(new Set());
    setExpandedCollection(null);
    setCollectionTracks([]);

    try {
      const result = await invoke<MusicSearchResult>('search_music', {
        query: query.trim(),
        source,
      });
      setTracks(result.tracks);
      setCollections(result.collections);
    } catch (error: any) {
      console.error('Music search failed:', error);
      alert('Search failed: ' + error);
    } finally {
      setSearching(false);
    }
  };

  const handleResolveSpotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotifyUrl.trim()) return;
    setResolvingSpotify(true);
    setTracks([]);
    setCollections([]);
    setSelectedUrls(new Set());

    try {
      const result = await invoke<MusicSearchResult>('resolve_spotify_url', {
        url: spotifyUrl.trim(),
      });
      setTracks(result.tracks);
      setCollections(result.collections);
      setActiveTab('tracks');
    } catch (error: any) {
      console.error('Spotify resolve failed:', error);
      alert('Spotify Converter Error:\n' + error);
    } finally {
      setResolvingSpotify(false);
    }
  };

  const toggleSelection = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const expandCollection = async (collection: MusicCollection) => {
    if (expandedCollection === collection.id) {
      setExpandedCollection(null);
      setCollectionTracks([]);
      return;
    }
    setExpandedCollection(collection.id);
    setLoadingCollection(true);
    setCollectionTracks([]);
    try {
      if (collection.tracks.length > 0) {
        setCollectionTracks(collection.tracks);
      } else {
        const fetched = await invoke<MusicCollection>('fetch_collection_tracks', { url: collection.webpage_url });
        setCollectionTracks(fetched.tracks);
      }
    } catch (error: any) {
      console.error('Failed to fetch collection:', error);
    } finally {
      setLoadingCollection(false);
    }
  };

  const downloadTracks = async (urls: string[]) => {
    if (urls.length === 0) return;
    setDownloading(true);

    const promises = urls.map((url, idx) =>
        invoke('download_music', {
          url,
          saveDir,
          options: {
            format_id: audioFormat,
            embed_thumbnail: embedThumbnail,
            embed_metadata: embedMetadata,
            browser_for_cookies: browserForCookies !== 'none' ? browserForCookies : null,
            cookies_path: cookiesPath || null,
            proxy_url: buildProxyUrl(useSettingsStore.getState()),
            write_lyrics: writeLyrics,
            add_metadata: true,
            parse_metadata: true,
          } as MusicDownloadOptions,
      }).then(() => {
        useDownloadStore.getState().fetchDownloads();
        return { success: true, idx };
      }).catch((err) => {
        console.error(`Failed to add download ${url}:`, err);
        return { success: false, idx, err };
      })
    );

    let resolved = 0;
    for (const p of promises) {
      p.then(() => {
        resolved++;
        setDownloadProgress(`Added ${resolved}/${urls.length} tracks to Queue...`);
      });
    }

    const results = await Promise.all(promises);
    const succeeded = results.filter((r) => r.success).length;

    setDownloadProgress(`Added ${succeeded}/${urls.length} tracks to downloads.`);
    await useDownloadStore.getState().fetchDownloads();

    setTimeout(() => {
      setDownloading(false);
      setDownloadProgress('');
      useDownloadStore.getState().setCurrentView('downloads');
    }, 2000);
  };

  const handleDownloadSelected = () => {
    const urls = Array.from(selectedUrls);
    downloadTracks(urls);
  };

  const handleDownloadCollection = (collection: MusicCollection) => {
    const urls = collection.tracks.map((t) => t.webpage_url);
    downloadTracks(urls);
  };

  const selectAll = () => {
    const currentItems = activeTab === 'tracks' ? tracks : collectionTracks;
    if (selectedUrls.size === currentItems.length && currentItems.length > 0) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(currentItems.map(t => t.webpage_url)));
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E&quot;)] opacity-5 mix-blend-overlay pointer-events-none z-0"></div>
      
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.04] bg-zinc-950 shrink-0 z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <Music className="w-5 h-5 text-pink-400" />
            Intelligent Music Downloader
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Convert Spotify collections or search multiple platforms for high-quality, DRM-free audio.</p>
        </div>
        
        {/* Toggle Mode */}
        <div className="flex items-center bg-zinc-900 border border-white/[0.06] rounded-lg p-0.5 shrink-0 self-start md:self-auto">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-7 px-3.5 text-xs font-semibold rounded-md transition-all ${
              mainView === 'search' ? 'bg-pink-500/10 text-pink-400' : 'text-zinc-400 hover:text-white'
            }`}
            onClick={() => setMainView('search')}
          >
            <Search className="w-3.5 h-3.5 mr-1.5" />
            Platform Search
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-7 px-3.5 text-xs font-semibold rounded-md transition-all ${
              mainView === 'spotify' ? 'bg-pink-500/10 text-pink-400' : 'text-zinc-400 hover:text-white'
            }`}
            onClick={() => setMainView('spotify')}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
            Spotify Link Converter
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 z-10">
        
        {/* Form panel */}
        <div className="w-full md:w-[320px] border-r border-white/[0.04] bg-zinc-950/40 p-5 space-y-5 overflow-y-auto shrink-0">
          
          {mainView === 'search' ? (
            <form onSubmit={handleSearch} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Search query</label>
                <Input 
                  value={query} 
                  onChange={(e) => setQuery(e.target.value)} 
                  placeholder="Song title, artist, or album..." 
                  className="bg-zinc-900/40 border-white/[0.08] text-white focus-visible:ring-pink-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Platform Source</label>
                <Select value={source} onValueChange={(val) => val && setSource(val)}>
                  <SelectTrigger className="bg-zinc-900/40 border-white/[0.08]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10">
                    {PLATFORMS.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-zinc-300 focus:bg-pink-500/10 focus:text-pink-400">
                        <div className="flex justify-between w-[240px]">
                          <span>{p.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono font-medium">{p.maxQuality}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={searching || !query} className="w-full bg-pink-600 hover:bg-pink-500 text-white font-semibold shadow-lg shadow-pink-600/10">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search Music'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResolveSpotify} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Spotify URL</label>
                <Input 
                  value={spotifyUrl} 
                  onChange={(e) => setSpotifyUrl(e.target.value)} 
                  placeholder="https://open.spotify.com/track/..." 
                  className="bg-zinc-900/40 border-white/[0.08] text-white focus-visible:ring-pink-500/50 text-[12px]"
                />
              </div>
              <Button type="submit" disabled={resolvingSpotify || !spotifyUrl} className="w-full bg-pink-600 hover:bg-pink-500 text-white font-semibold shadow-lg shadow-pink-600/10">
                {resolvingSpotify ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Convert & Fetch'}
              </Button>
            </form>
          )}

          <div className="border-t border-white/[0.04] pt-4 space-y-4">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Encoding Settings</h4>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">Preferred Format</label>
              <Select value={audioFormat} onValueChange={(val) => val && setAudioFormat(val)}>
                <SelectTrigger className="bg-zinc-900/40 border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  {FORMATS.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-zinc-300 focus:bg-pink-500/10 focus:text-pink-400">
                      <div className="flex justify-between w-[240px]">
                        <span>{f.name}</span>
                        <span className="text-[10px] text-zinc-500">{f.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="flex items-center space-x-2.5">
                <Checkbox id="meta" checked={embedMetadata} onCheckedChange={(val) => setEmbedMetadata(!!val)} className="border-zinc-700 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500" />
                <label htmlFor="meta" className="text-xs font-medium text-zinc-400 select-none cursor-pointer">Embed Album ID3 Tags</label>
              </div>
              <div className="flex items-center space-x-2.5">
                <Checkbox id="thumb" checked={embedThumbnail} onCheckedChange={(val) => setEmbedThumbnail(!!val)} className="border-zinc-700 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500" />
                <label htmlFor="thumb" className="text-xs font-medium text-zinc-400 select-none cursor-pointer">Embed Cover Artwork</label>
              </div>
              <div className="flex items-center space-x-2.5">
                <Checkbox id="lyrics" checked={writeLyrics} onCheckedChange={(val) => setWriteLyrics(!!val)} className="border-zinc-700 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500" />
                <label htmlFor="lyrics" className="text-xs font-medium text-zinc-400 select-none cursor-pointer">Search & Write Lyrics</label>
              </div>
            </div>

            <div className="space-y-1.5 pt-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">Save Directory</label>
              <div className="flex gap-2">
                <Input value={saveDir} readOnly className="h-8 text-[10px] font-mono bg-zinc-900/40 border-white/[0.08] text-zinc-500 focus-visible:ring-0 flex-1" />
                <Button variant="secondary" size="sm" className="h-8 px-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06]" onClick={async () => {
                  const selected = await open({ directory: true, multiple: false });
                  if (selected) setCustomSaveDir(selected as string);
                }}>
                  Browse
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content list panel */}
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
          {tracks.length > 0 || collections.length > 0 ? (
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Header tabs */}
              <div className="px-6 py-3 border-b border-white/[0.04] bg-zinc-950 flex items-center justify-between shrink-0">
                <div className="flex items-center bg-zinc-900 border border-white/[0.06] rounded-md p-0.5">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={`h-6 px-3 text-[11.5px] rounded transition-all ${
                      activeTab === 'tracks' ? 'bg-white/[0.06] text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    onClick={() => setActiveTab('tracks')}
                  >
                    Tracks ({tracks.length})
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={`h-6 px-3 text-[11.5px] rounded transition-all ${
                      activeTab === 'albums' ? 'bg-white/[0.06] text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    onClick={() => setActiveTab('albums')}
                  >
                    Albums & Playlists ({collections.length})
                  </Button>
                </div>

                {activeTab === 'tracks' && (
                  <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-zinc-400 hover:text-white text-xs">
                    {selectedUrls.size === tracks.length ? 'Deselect All' : 'Select All'}
                  </Button>
                )}
              </div>

              {/* Items Scroller */}
              <div className="flex-1 overflow-y-auto p-6 min-h-0">
                
                {activeTab === 'tracks' ? (
                  <div className="space-y-1.5">
                    {tracks.map((track) => {
                      const isSelected = selectedUrls.has(track.webpage_url);
                      return (
                        <div 
                          key={track.id}
                          onClick={() => toggleSelection(track.webpage_url)}
                          className={`flex items-center gap-4 px-4 py-2.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-pink-500/5 border-pink-500/20' 
                              : 'bg-zinc-900/10 border-white/[0.04] hover:bg-white/[0.02] hover:border-white/[0.08]'
                          }`}
                        >
                          <Checkbox 
                            checked={isSelected} 
                            onCheckedChange={() => toggleSelection(track.webpage_url)}
                            className={isSelected ? "border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white" : "border-zinc-700"}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {track.thumbnail ? (
                            <div className="w-10 h-10 rounded overflow-hidden bg-zinc-900 shrink-0 border border-white/[0.06]">
                              <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded bg-zinc-900 border border-white/[0.06] flex items-center justify-center shrink-0">
                              <Music className="w-4 h-4 text-zinc-600" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[13px] font-semibold text-zinc-200 truncate">{track.title}</h4>
                            <p className="text-[11px] text-zinc-500 truncate mt-0.5 flex items-center gap-1.5">
                              <Mic2 className="w-3 h-3 text-zinc-600" />
                              <span>{track.artist}</span>
                              {track.album && (
                                <>
                                  <span className="text-zinc-700">•</span>
                                  <Disc3 className="w-3 h-3 text-zinc-600" />
                                  <span className="truncate">{track.album}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                            <span>{formatDuration(track.duration)}</span>
                            <Badge variant="outline" className="border-white/5 bg-zinc-900 text-zinc-400 capitalize text-[9.5px]">
                              {track.platform}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {collections.map((col) => {
                      const isExpanded = expandedCollection === col.id;
                      return (
                        <div key={col.id} className="border border-white/[0.04] bg-zinc-900/10 rounded-xl overflow-hidden">
                          <div className="flex items-center gap-4 p-4">
                            {col.thumbnail ? (
                              <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-900 border border-white/[0.06] shrink-0">
                                <img src={col.thumbnail} alt={col.title} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-lg bg-zinc-900 border border-white/[0.06] flex items-center justify-center shrink-0">
                                <ListMusic className="w-6 h-6 text-zinc-600" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-[14px] font-bold text-white truncate">{col.title}</h4>
                                <Badge className="bg-pink-500/10 text-pink-400 hover:bg-pink-500/15 border border-pink-500/20 text-[9.5px] uppercase font-bold tracking-wider px-1.5">{col.collection_type}</Badge>
                              </div>
                              <p className="text-[11.5px] text-zinc-500 mt-1 flex items-center gap-1.5">
                                <Mic2 className="w-3.5 h-3.5 text-zinc-600" />
                                <span>{col.artist}</span>
                                {col.year && (
                                  <>
                                    <span className="text-zinc-700">•</span>
                                    <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                                    <span>{col.year}</span>
                                  </>
                                )}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => expandCollection(col)} 
                                className="h-8 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs border border-white/[0.06]"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                <span className="ml-1.5">{isExpanded ? 'Hide' : 'Expand'}</span>
                              </Button>
                              <Button 
                                onClick={() => handleDownloadCollection(col)} 
                                className="h-8 bg-pink-600 hover:bg-pink-500 text-white font-semibold text-xs shadow-lg shadow-pink-600/10"
                              >
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                Download All
                              </Button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-white/[0.04] bg-zinc-950/30 p-4 space-y-1.5">
                              {loadingCollection ? (
                                <div className="flex items-center justify-center py-6 text-zinc-500 gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                                  <span className="text-xs">Fetching tracks...</span>
                                </div>
                              ) : collectionTracks.length === 0 ? (
                                <div className="text-center py-4 text-xs text-zinc-600">No tracks found inside this collection.</div>
                              ) : (
                                <>
                                  <div className="flex justify-between items-center px-2 pb-2 text-[10.5px] font-bold text-zinc-600 uppercase tracking-wider">
                                    <span>Tracks Inside Collection</span>
                                    <Button variant="ghost" size="sm" onClick={selectAll} className="h-5 hover:bg-white/5 text-zinc-500 hover:text-white px-2 rounded text-[10.5px]">
                                      {selectedUrls.size === collectionTracks.length ? 'Deselect All' : 'Select All'}
                                    </Button>
                                  </div>
                                  {collectionTracks.map((track) => {
                                    const isSelected = selectedUrls.has(track.webpage_url);
                                    return (
                                      <div 
                                        key={track.id}
                                        onClick={() => toggleSelection(track.webpage_url)}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                                          isSelected 
                                            ? 'bg-pink-500/5 border-pink-500/15' 
                                            : 'bg-transparent border-transparent hover:bg-white/[0.02]'
                                        }`}
                                      >
                                        <Checkbox 
                                          checked={isSelected} 
                                          onCheckedChange={() => toggleSelection(track.webpage_url)}
                                          className={isSelected ? "border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white" : "border-zinc-800"}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <span className="text-[11px] font-mono text-zinc-600 w-5 shrink-0 text-center">
                                          {track.track_number ? String(track.track_number).padStart(2, '0') : '--'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <h5 className="text-[12.5px] font-semibold text-zinc-200 truncate">{track.title}</h5>
                                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">{track.artist}</p>
                                        </div>
                                        <span className="text-[10.5px] font-mono text-zinc-600 shrink-0">{formatDuration(track.duration)}</span>
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>

              {/* Action Footer */}
              <div className="px-6 py-4 border-t border-white/[0.04] bg-zinc-950 flex justify-between items-center shrink-0">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  {selectedUrls.size} tracks selected for download
                </div>
                <Button 
                  onClick={handleDownloadSelected} 
                  disabled={selectedUrls.size === 0 || downloading} 
                  className="px-6 h-10 font-bold rounded-lg bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-600/25 transition-all text-[13px]"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {downloadProgress || 'Adding...'}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-1.5" />
                      Download Selected Tracks
                    </>
                  )}
                </Button>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-3 text-center max-w-sm mx-auto">
              <Headphones className="w-12 h-12 text-zinc-800" />
              <div>
                <p className="text-sm font-semibold text-zinc-400">Search or convert Spotify links</p>
                <p className="text-xs text-zinc-600 mt-1">Configure search parameters in the left panel to fetch track indexing arrays from multiple platforms.</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
