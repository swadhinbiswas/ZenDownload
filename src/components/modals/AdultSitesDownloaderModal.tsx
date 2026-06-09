import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, ExternalLink, AlertTriangle, X } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTranslation } from '@/i18n/useTranslation';

interface AdultSiteInfo {
  key: string;
  displayName: string;
  hosts: string[];
  searchUrl: string;
  hasSearch: boolean;
  icon: string;
}

const ADULT_SITES: AdultSiteInfo[] = [
  { key: 'pornhub', displayName: 'Pornhub', hosts: ['pornhub.com', 'www.pornhub.com'], searchUrl: 'https://www.pornhub.com/video/search?search=%s', hasSearch: true, icon: 'PH' },
  { key: 'xhamster', displayName: 'xHamster', hosts: ['xhamster.com', 'xhamster2.com', 'xhamster.desi', 'xhamster.one'], searchUrl: 'https://xhamster.com/search/%s', hasSearch: true, icon: 'XH' },
  { key: 'xvideos', displayName: 'XVideos', hosts: ['xvideos.com', 'www.xvideos.com'], searchUrl: 'https://www.xvideos.com/?k=%s', hasSearch: true, icon: 'XV' },
  { key: 'redtube', displayName: 'RedTube', hosts: ['redtube.com', 'www.redtube.com'], searchUrl: 'https://www.redtube.com/?search=%s', hasSearch: true, icon: 'RT' },
  { key: 'youporn', displayName: 'YouPorn', hosts: ['youporn.com', 'www.youporn.com'], searchUrl: 'https://www.youporn.com/search/?query=%s', hasSearch: true, icon: 'YP' },
  { key: 'xnxx', displayName: 'xnxx', hosts: ['xnxx.com', 'www.xnxx.com'], searchUrl: 'https://www.xnxx.com/search/%s', hasSearch: true, icon: 'XN' },
  { key: 'beeg', displayName: 'Beeg', hosts: ['beeg.com', 'www.beeg.com'], searchUrl: 'https://beeg.com/?q=%s', hasSearch: true, icon: 'BG' },
  { key: 'eporner', displayName: 'Eporner', hosts: ['eporner.com', 'www.eporner.com'], searchUrl: 'https://www.eporner.com/search/%s/', hasSearch: true, icon: 'EP' },
  { key: 'spankbang', displayName: 'SpankBang', hosts: ['spankbang.com', 'www.spankbang.com'], searchUrl: 'https://spankbang.com/s/%s/', hasSearch: true, icon: 'SB' },
  { key: 'tnaflix', displayName: 'TnaFlix', hosts: ['tnaflix.com', 'www.tnaflix.com'], searchUrl: 'https://www.tnaflix.com/search.php?what=%s', hasSearch: true, icon: 'TF' },
  { key: 'hclips', displayName: 'hClips', hosts: ['hclips.com', 'www.hclips.com'], searchUrl: 'https://www.hclips.com/search/%s/', hasSearch: true, icon: 'HC' },
  { key: 'motherless', displayName: 'Motherless', hosts: ['motherless.com', 'www.motherless.com'], searchUrl: 'https://motherless.com/search?term=%s', hasSearch: true, icon: 'ML' },
  { key: 'vidbee', displayName: 'VidBee', hosts: ['vidbee.com', 'www.vidbee.com'], searchUrl: 'https://vidbee.com/search?q=%s', hasSearch: true, icon: 'VB' },
  { key: 'tube8', displayName: 'Tube8', hosts: ['tube8.com', 'www.tube8.com'], searchUrl: 'https://www.tube8.com/search/%s/', hasSearch: true, icon: 'T8' },
  { key: 'nuvid', displayName: 'NuVid', hosts: ['nuvid.com', 'www.nuvid.com'], searchUrl: 'https://www.nuvid.com/search/%s/', hasSearch: true, icon: 'NV' },
  { key: 'xtube', displayName: 'X-Tube', hosts: ['x-tube.com', 'www.x-tube.com'], searchUrl: 'https://www.x-tube.com/search/%s/', hasSearch: true, icon: 'XT' },
];

interface StreamFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  vcodec: string;
  acodec: string;
}

interface SearchResult {
  id: string;
  title: string;
  url: string;
  duration: number | null;
  thumbnail: string | null;
}

interface AdultSitesDownloaderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdultSitesDownloaderModal({ isOpen, onClose }: AdultSitesDownloaderModalProps) {
  const [selectedSite, setSelectedSite] = useState<AdultSiteInfo>(ADULT_SITES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [formats, setFormats] = useState<StreamFormat[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'url' | 'search'>('url');
  const adultAgeVerified = useSettingsStore(s => s.adultAgeVerified);
  const saveSettings = useSettingsStore(s => s.saveSettings);
  const { t: _t } = useTranslation();

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setDirectUrl('');
      setFormats([]);
      setSearchResults([]);
      setError(null);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    setSearchResults([]);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<SearchResult[]>('search_adult_site', {
        site: selectedSite.key,
        query: searchQuery,
      });
      setSearchResults(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleProbeUrl = async (url: string) => {
    setLoading(true);
    setError(null);
    setFormats([]);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ formats: StreamFormat[]; title: string }>('probe_stream_url', {
        url,
        browserForCookies: null,
        cookiesPath: null,
        extraMeta: null,
      });
      setFormats(result.formats || []);
      if (selectedSite.hasSearch) {
        setActiveTab('url');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const savePath = await invoke<string>('get_default_save_path');
      await invoke('add_download', {
        url,
        savePath,
        threads: 4,
        category: 'Video',
        extraMeta: JSON.stringify({ source: selectedSite.key, isAdult: true }),
      });
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const openExternal = (url: string) => {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!adultAgeVerified) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent showCloseButton={false} className="sm:max-w-md p-0 bg-zinc-950 border-white/[0.08]">
          <div className="p-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Age Verification Required
              </DialogTitle>
            </DialogHeader>
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-zinc-300 space-y-2">
              <p className="font-semibold text-red-400">18+ Content Ahead</p>
              <p>This downloader is designed to access adult content. By proceeding you confirm that you are at least 18 years of age (or the age of majority in your jurisdiction) and that it is legal for you to access such content.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/[0.08] text-zinc-300">
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await saveSettings({ adultAgeVerified: true });
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white"
              >
                I am 18 or older
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] md:max-w-[800px] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl">
        <div className="p-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="mb-6">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🔞</span>
                Adult Sites Downloader
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06]">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Powered by yt-dlp • Supports 1700+ sites • 18+ content
            </p>
          </DialogHeader>

          <div className="grid gap-3 max-w-2xl mb-6">
            <Label className="text-zinc-300 font-semibold">Select Site</Label>
            <Select value={selectedSite.key} onValueChange={v => {
              const site = ADULT_SITES.find(s => s.key === v);
              if (site) setSelectedSite(site);
              setSearchResults([]);
              setFormats([]);
            }}>
              <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white max-h-80">
                {ADULT_SITES.map(site => (
                  <SelectItem key={site.key} value={site.key}>{site.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex border-b border-white/[0.06] mb-6">
            <button
              onClick={() => setActiveTab('url')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'url'
                  ? 'text-pink-400 border-b-2 border-pink-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Direct URL
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'search'
                  ? 'text-pink-400 border-b-2 border-pink-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Search
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {activeTab === 'url' && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <Label className="text-zinc-300 font-semibold">Video URL</Label>
                <div className="flex space-x-2">
                  <Input
                    value={directUrl}
                    onChange={e => setDirectUrl(e.target.value)}
                    placeholder={`Paste ${selectedSite.displayName} video URL...`}
                    className="flex-1 bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-pink-500/50"
                  />
                  <Button
                    onClick={() => handleProbeUrl(directUrl)}
                    disabled={!directUrl.trim() || loading}
                    className="h-11 px-5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl"
                  >
                    {loading ? 'Loading...' : 'Probe'}
                  </Button>
                </div>
              </div>

              {formats.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-zinc-300 font-semibold">Available Formats</Label>
                  <div className="grid gap-2 max-h-72 overflow-y-auto">
                    {formats
                      .filter(f => f.vcodec !== 'none' || f.acodec !== 'none')
                      .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))
                      .slice(0, 12)
                      .map(format => (
                        <div key={format.format_id} className="flex items-center justify-between p-3 bg-zinc-900/30 border border-white/5 rounded-xl">
                          <div className="flex flex-col">
                            <span className="text-sm text-white font-medium">{format.resolution} • {format.ext.toUpperCase()}</span>
                            <span className="text-xs text-zinc-500">
                              {format.vcodec !== 'none' && `V: ${format.vcodec}`}
                              {format.vcodec !== 'none' && format.acodec !== 'none' && ' • '}
                              {format.acodec !== 'none' && `A: ${format.acodec}`}
                              {format.filesize && ` • ${(format.filesize / 1024 / 1024).toFixed(1)} MB`}
                            </span>
                          </div>
                          <Button
                            onClick={() => handleDownload(directUrl)}
                            className="h-9 px-4 bg-pink-600 hover:bg-pink-500 text-white text-xs rounded-lg"
                          >
                            <Download className="w-3 h-3 mr-1.5" />
                            Download
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <Label className="text-zinc-300 font-semibold">Search Query</Label>
                <div className="flex space-x-2">
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder={`Search ${selectedSite.displayName}...`}
                    className="flex-1 bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-pink-500/50"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={!searchQuery.trim() || loading}
                    className="h-11 px-5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl"
                  >
                    <Search className="w-3.5 h-3.5 mr-1.5" />
                    Search
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">
                  Search via yt-dlp. For comprehensive results, you can also{' '}
                  <button
                    onClick={() => openExternal(selectedSite.searchUrl.replace('%s', encodeURIComponent(searchQuery)))}
                    className="text-pink-400 hover:underline inline-flex items-center gap-1"
                  >
                    browse on {selectedSite.displayName} <ExternalLink className="w-3 h-3" />
                  </button>
                </p>
              </div>

              {searchResults.length > 0 && (
                <div className="grid gap-2 max-h-96 overflow-y-auto">
                  {searchResults.map(result => (
                    <div key={result.id} className="flex items-center justify-between p-3 bg-zinc-900/30 border border-white/5 rounded-xl">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {result.thumbnail && (
                          <img src={result.thumbnail} alt="" className="w-16 h-12 object-cover rounded-lg shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white font-medium truncate">{result.title}</p>
                          {result.duration && (
                            <p className="text-xs text-zinc-500">
                              {Math.floor(result.duration / 60)}:{(result.duration % 60).toString().padStart(2, '0')}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => handleProbeUrl(result.url)}
                        disabled={loading}
                        className="h-9 px-4 bg-pink-600 hover:bg-pink-500 text-white text-xs rounded-lg shrink-0"
                      >
                        <Download className="w-3 h-3 mr-1.5" />
                        Get
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {!loading && searchResults.length === 0 && searchQuery && (
                <div className="p-4 text-center text-zinc-500 text-sm">
                  No results yet. Click "Search" to find videos.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
