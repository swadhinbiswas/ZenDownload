import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { buildProxyUrl } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Music, Search, Download, Disc3, Headphones, Volume2,
  ListMusic, Album, ChevronDown, ChevronUp, Mic2, Calendar,
  Link2, ArrowRightLeft, X
} from 'lucide-react';

// --- Types matching Rust backend ---
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

interface MusicDownloaderModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export function MusicDownloaderModal({ isOpen, onClose }: MusicDownloaderModalProps) {
  const pathMusic = useSettingsStore((state) => state.pathMusic);
  const pathGeneral = useSettingsStore((state) => state.pathGeneral);
  const browserForCookies = useSettingsStore((state) => state.browserForCookies);
  const cookiesPath = useSettingsStore((state) => state.cookiesPath);

  const [query, setQuery] = useState('');
  const [source, setSource] = useState('youtube');
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

  const saveDir = pathMusic || pathGeneral || '/tmp';
  const currentPlatform = PLATFORMS.find((p) => p.id === source);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTracks([]);
      setCollections([]);
      setSelectedUrls(new Set());
      setExpandedCollection(null);
      setCollectionTracks([]);
      setDownloadProgress('');
      setActiveTab('tracks');
      setMainView('search');
      setSpotifyUrl('');
    }
  }, [isOpen]);

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

    // Fire all downloads in parallel (each returns immediately with the ID)
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
        // Refresh the global download list so tracks appear immediately
        useDownloadStore.getState().fetchDownloads();
        return { success: true, idx };
      }).catch((err) => {
        console.error(`Failed to add download ${url}:`, err);
        return { success: false, idx, err };
      })
    );

    // Show progress as they resolve
    let resolved = 0;
    for (const p of promises) {
      p.then(() => {
        resolved++;
        setDownloadProgress(`Added ${resolved}/${urls.length} tracks...`);
      });
    }

    const results = await Promise.all(promises);
    const succeeded = results.filter((r) => r.success).length;

    setDownloadProgress(`Added ${succeeded}/${urls.length} tracks to downloads.`);

    // Final refresh to ensure all are visible
    await useDownloadStore.getState().fetchDownloads();

    // Keep modal open briefly so user can see confirmation, then auto-close
    setTimeout(() => {
      setDownloading(false);
      setDownloadProgress('');
      onClose();
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
      setSelectedUrls(new Set(currentItems.map((t) => t.webpage_url)));
    }
  };

  const totalResults = tracks.length + collections.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !downloading && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[900px] w-[95vw] p-0 bg-zinc-950 border-white/[0.08] shadow-2xl rounded-xl overflow-hidden"
      >
        <div className="flex flex-col h-[88vh]">
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
                <Headphones className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight text-white">Music Downloader</DialogTitle>
                <p className="text-[13px] text-zinc-500">
                  {mainView === 'search'
                    ? <>High-quality audio from {PLATFORMS.length} platforms · <span className="text-pink-400">{currentPlatform?.maxQuality}</span> max</>
                    : <><span className="text-emerald-400">Spotify Converter</span> · Finds matches on YouTube Music</>
                  }
                </p>
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06]"
              onClick={() => !downloading && onClose()}
              disabled={downloading}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Tab Toggle */}
          <div className="shrink-0 px-6 pt-3 pb-2">
            <div className="flex items-center gap-1 bg-zinc-900/50 rounded-lg p-0.5 border border-white/[0.06] w-fit">
              <button
                onClick={() => setMainView('search')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                  mainView === 'search' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Search
              </button>
              <button
                onClick={() => setMainView('spotify')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                  mainView === 'spotify'
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Spotify Converter
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
            {mainView === 'search' ? (
              <div className="flex flex-col h-full gap-3">
                {/* Search Row */}
                <form onSubmit={handleSearch} className="shrink-0 flex gap-2">
                  <Select value={source} onValueChange={(v) => v && setSource(v)}>
                    <SelectTrigger className="w-[140px] bg-zinc-900/50 border-white/[0.08] text-white h-9 rounded-lg text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent sideOffset={4} className="bg-zinc-900 border-zinc-800 text-white z-[100]">
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-[13px]">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search songs, artists, albums..."
                    className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-9 rounded-lg focus-visible:ring-pink-500/50 text-[13px]"
                  />
                  <Button type="submit" disabled={searching || !query.trim()} className="px-4 h-9 font-medium rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[13px]">
                    {searching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                    Search
                  </Button>
                </form>

                {/* Options Row */}
                <div className="shrink-0 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
                    <Select value={audioFormat} onValueChange={(v) => v && setAudioFormat(v)}>
                      <SelectTrigger className="h-8 w-[120px] bg-zinc-900/50 border-white/[0.08] text-white text-[12px] rounded-lg">
                        <SelectValue placeholder="Format" />
                      </SelectTrigger>
                      <SelectContent sideOffset={4} align="start" className="bg-zinc-900 border-zinc-800 text-white min-w-[180px] z-[100]">
                        {FORMATS.map((f) => (
                          <SelectItem key={f.id} value={f.id} className="text-[12px]">
                            <span className="font-medium text-white">{f.name}</span>
                            <span className="text-zinc-500 ml-2">{f.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                      <Checkbox checked={embedThumbnail} onCheckedChange={(c) => setEmbedThumbnail(!!c)} className="border-zinc-600 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white" />
                      Cover
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                      <Checkbox checked={embedMetadata} onCheckedChange={(c) => setEmbedMetadata(!!c)} className="border-zinc-600 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white" />
                      ID3
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                      <Checkbox checked={writeLyrics} onCheckedChange={(c) => setWriteLyrics(!!c)} className="border-zinc-600 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white" />
                      Lyrics
                    </label>
                  </div>
                </div>

                {/* Sub-tabs */}
                {totalResults > 0 && (
                  <div className="shrink-0 flex items-center gap-1 border-b border-white/[0.06]">
                    <button
                      onClick={() => setActiveTab('tracks')}
                      className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors border-b-2 ${
                        activeTab === 'tracks' ? 'text-pink-400 border-pink-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                    >
                      <ListMusic className="w-3.5 h-3.5" />
                      Tracks ({tracks.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('albums')}
                      className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors border-b-2 ${
                        activeTab === 'albums' ? 'text-pink-400 border-pink-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                    >
                      <Album className="w-3.5 h-3.5" />
                      Albums ({collections.length})
                    </button>
                  </div>
                )}

                {/* Results List - scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto border rounded-xl border-white/[0.06] bg-zinc-900/20">
                  {totalResults === 0 && !searching && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3 py-12">
                      <Disc3 className="w-10 h-10 text-zinc-700" />
                      <p className="text-sm font-medium">Search for music across {PLATFORMS.length} platforms</p>
                    </div>
                  )}
                  {searching && totalResults === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3 py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                      <p className="text-sm font-medium">Searching {currentPlatform?.name}...</p>
                    </div>
                  )}

                  {activeTab === 'tracks' && tracks.length > 0 && (
                    <div className="space-y-0.5 p-1.5">
                      {tracks.map((track, idx) => {
                        const isSelected = selectedUrls.has(track.webpage_url);
                        return (
                          <div
                            key={idx}
                            onClick={() => toggleSelection(track.webpage_url)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 border ${
                              isSelected ? 'bg-pink-500/[0.06] border-pink-500/20' : 'hover:bg-white/[0.02] border-transparent'
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelection(track.webpage_url)}
                              className={`shrink-0 ${isSelected ? 'border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white' : 'border-zinc-600'}`}
                            />
                            {track.thumbnail ? (
                              <img src={track.thumbnail} alt="" className="w-10 h-10 rounded-md object-cover shrink-0 bg-zinc-800" loading="lazy" />
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                                <Music className="w-4 h-4 text-zinc-600" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-zinc-200 truncate">{track.title}</p>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 truncate">
                                <span className="flex items-center gap-0.5"><Mic2 className="w-3 h-3" /> {track.artist}</span>
                                {track.album && <span>· {track.album}</span>}
                                {track.year && <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {track.year}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {track.quality_note && (
                                <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
                                  {track.quality_note}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] border-white/[0.08] text-zinc-500 bg-zinc-800/50">
                                {formatDuration(track.duration)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {activeTab === 'albums' && collections.length > 0 && (
                    <div className="space-y-1 p-1.5">
                      {collections.map((collection, idx) => {
                        const isExpanded = expandedCollection === collection.id;
                        return (
                          <div key={idx} className="border border-white/[0.06] rounded-xl overflow-hidden bg-zinc-900/30">
                            <div
                              onClick={() => expandCollection(collection)}
                              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />}
                              {collection.thumbnail ? (
                                <img src={collection.thumbnail} alt="" className="w-12 h-12 rounded-md object-cover shrink-0 bg-zinc-800" />
                              ) : (
                                <div className="w-12 h-12 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                                  <Album className="w-5 h-5 text-zinc-600" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-zinc-200 truncate">{collection.title}</p>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                  <span className="flex items-center gap-0.5"><Mic2 className="w-3 h-3" /> {collection.artist}</span>
                                  {collection.year && <span>· {collection.year}</span>}
                                  <span>·</span>
                                  <Badge variant="outline" className="text-[10px] border-white/[0.08] text-zinc-500 bg-zinc-800/50 capitalize">
                                    {collection.collection_type}
                                  </Badge>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="h-7 px-3 text-[11px] rounded-lg bg-pink-600/80 hover:bg-pink-500 text-white shrink-0"
                                onClick={(e) => { e.stopPropagation(); handleDownloadCollection(collection); }}
                                disabled={downloading}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                All
                              </Button>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-white/[0.04] px-3 py-2 space-y-0.5">
                                {loadingCollection ? (
                                  <div className="flex items-center justify-center py-4 text-zinc-500 gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-pink-500" />
                                    <span className="text-[12px]">Loading tracks...</span>
                                  </div>
                                ) : (
                                  collectionTracks.map((track, tidx) => {
                                    const isSelected = selectedUrls.has(track.webpage_url);
                                    return (
                                      <div
                                        key={tidx}
                                        onClick={() => toggleSelection(track.webpage_url)}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                                          isSelected ? 'bg-pink-500/[0.06]' : 'hover:bg-white/[0.02]'
                                        }`}
                                      >
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() => toggleSelection(track.webpage_url)}
                                          className={`shrink-0 ${isSelected ? 'border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:text-white' : 'border-zinc-600'}`}
                                        />
                                        <span className="text-[11px] text-zinc-600 font-mono w-5 text-right shrink-0">{track.track_number || tidx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[12px] text-zinc-300 truncate">{track.title}</p>
                                        </div>
                                        <span className="text-[11px] text-zinc-600 shrink-0">{formatDuration(track.duration)}</span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Spotify Converter View */
              <div className="flex flex-col h-full gap-3">
                <div className="shrink-0 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-emerald-300">Spotify → YouTube Music Converter</h3>
                      <p className="text-[12px] text-zinc-500 mt-1 leading-relaxed">
                        Spotify uses DRM encryption. Paste a link and we'll find the matching track on YouTube Music.
                      </p>
                      <p className="text-[11px] text-zinc-600 mt-1">Supports: tracks, albums, playlists</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleResolveSpotify} className="shrink-0 flex gap-2">
                  <Input
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value)}
                    placeholder="Paste Spotify link..."
                    className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-9 rounded-lg focus-visible:ring-emerald-500/50 text-[13px]"
                  />
                  <Button type="submit" disabled={resolvingSpotify || !spotifyUrl.trim()} className="px-4 h-9 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px]">
                    {resolvingSpotify ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />}
                    Convert
                  </Button>
                </form>

                {/* Results */}
                <div className="flex-1 min-h-0 overflow-y-auto border rounded-xl border-white/[0.06] bg-zinc-900/20">
                  {totalResults === 0 && !resolvingSpotify && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3 py-12">
                      <Link2 className="w-10 h-10 text-zinc-700" />
                      <p className="text-sm font-medium">Paste a Spotify link to find matches</p>
                    </div>
                  )}
                  {resolvingSpotify && totalResults === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3 py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                      <p className="text-sm font-medium">Fetching Spotify metadata & searching...</p>
                    </div>
                  )}
                  {tracks.length > 0 && (
                    <div className="space-y-0.5 p-1.5">
                      {tracks.map((track, idx) => {
                        const isSelected = selectedUrls.has(track.webpage_url);
                        return (
                          <div
                            key={idx}
                            onClick={() => toggleSelection(track.webpage_url)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 border ${
                              isSelected ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'hover:bg-white/[0.02] border-transparent'
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelection(track.webpage_url)}
                              className={`shrink-0 ${isSelected ? 'border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white' : 'border-zinc-600'}`}
                            />
                            {track.thumbnail ? (
                              <img src={track.thumbnail} alt="" className="w-10 h-10 rounded-md object-cover shrink-0 bg-zinc-800" loading="lazy" />
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                                <Music className="w-4 h-4 text-zinc-600" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-zinc-200 truncate">{track.title}</p>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 truncate">
                                <span className="flex items-center gap-0.5"><Mic2 className="w-3 h-3" /> {track.artist}</span>
                                {track.album && <span>· {track.album}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {track.quality_note && (
                                <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
                                  {track.quality_note}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] border-white/[0.08] text-zinc-500 bg-zinc-800/50">
                                {formatDuration(track.duration)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer - always visible */}
          <div className="shrink-0 px-6 py-4 border-t border-white/[0.06] bg-zinc-950/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost" size="sm"
                className="text-[12px] text-zinc-400 hover:text-zinc-200 h-8 px-2"
                onClick={selectAll}
                disabled={mainView === 'search'
                  ? (activeTab === 'tracks' ? tracks.length === 0 : collectionTracks.length === 0)
                  : tracks.length === 0
                }
              >
                {selectedUrls.size > 0 ? 'Deselect All' : 'Select All'}
              </Button>
              <span className="text-[11px] text-zinc-600 font-medium">
                {selectedUrls.size} selected
              </span>
            </div>

            <div className="flex items-center gap-3">
              {downloadProgress && (
                <span className="text-[11px] text-pink-400 font-medium animate-pulse">{downloadProgress}</span>
              )}
              <Button
                variant="outline"
                className="h-9 px-5 font-medium rounded-lg bg-transparent border-white/[0.08] hover:bg-white/[0.04] text-zinc-400 text-[13px]"
                onClick={onClose}
                disabled={downloading}
              >
                Close
              </Button>
              <Button
                className="h-9 px-5 font-medium rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[13px] flex items-center gap-2"
                onClick={handleDownloadSelected}
                disabled={selectedUrls.size === 0 || downloading}
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download{selectedUrls.size > 0 && ` (${selectedUrls.size})`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
