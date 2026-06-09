import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';

interface AdultSiteInfo {
  key: string;
  displayName: string;
  hosts: string[];
  searchUrl: string;
  hasSearch: boolean;
  icon: string;
}

const ADULT_SITES: AdultSiteInfo[] = [
  { key: 'pornhub', displayName: 'Pornhub', hosts: ['pornhub.com'], searchUrl: 'https://www.pornhub.com/video/search?search=%s', hasSearch: true, icon: 'PH' },
  { key: 'xhamster', displayName: 'xHamster', hosts: ['xhamster.com'], searchUrl: 'https://xhamster.com/search/%s', hasSearch: true, icon: 'XH' },
  { key: 'xvideos', displayName: 'XVideos', hosts: ['xvideos.com'], searchUrl: 'https://www.xvideos.com/?k=%s', hasSearch: true, icon: 'XV' },
  { key: 'redtube', displayName: 'RedTube', hosts: ['redtube.com'], searchUrl: 'https://www.redtube.com/?search=%s', hasSearch: true, icon: 'RT' },
  { key: 'youporn', displayName: 'YouPorn', hosts: ['youporn.com'], searchUrl: 'https://www.youporn.com/search/?query=%s', hasSearch: true, icon: 'YP' },
  { key: 'xnxx', displayName: 'xnxx', hosts: ['xnxx.com'], searchUrl: 'https://www.xnxx.com/search/%s', hasSearch: true, icon: 'XN' },
  { key: 'beeg', displayName: 'Beeg', hosts: ['beeg.com'], searchUrl: 'https://beeg.com/?q=%s', hasSearch: true, icon: 'BG' },
  { key: 'eporner', displayName: 'Eporner', hosts: ['eporner.com'], searchUrl: 'https://www.eporner.com/search/%s/', hasSearch: true, icon: 'EP' },
  { key: 'spankbang', displayName: 'SpankBang', hosts: ['spankbang.com'], searchUrl: 'https://spankbang.com/s/%s/', hasSearch: true, icon: 'SB' },
  { key: 'tnaflix', displayName: 'TnaFlix', hosts: ['tnaflix.com'], searchUrl: 'https://www.tnaflix.com/search.php?what=%s', hasSearch: true, icon: 'TF' },
  { key: 'hclips', displayName: 'hClips', hosts: ['hclips.com'], searchUrl: 'https://www.hclips.com/search/%s/', hasSearch: true, icon: 'HC' },
  { key: 'motherless', displayName: 'Motherless', hosts: ['motherless.com'], searchUrl: 'https://motherless.com/search?term=%s', hasSearch: true, icon: 'ML' },
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

export function AdultSitePage() {
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

  if (!adultAgeVerified) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Age Verification Required</h2>
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-zinc-300 space-y-2 text-left">
            <p className="font-semibold text-red-400">18+ Content Ahead</p>
            <p>This downloader is designed to access adult content. By proceeding you confirm that you are at least 18 years of age (or the age of majority in your jurisdiction) and that it is legal for you to access such content.</p>
          </div>
          <Button
            onClick={async () => { await saveSettings({ adultAgeVerified: true }); }}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            I am 18 or older
          </Button>
        </div>
      </div>
    );
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    setSearchResults([]);
    try {
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
      const result = await invoke<{ formats: StreamFormat[]; title: string }>('probe_stream_url', {
        url,
        browserForCookies: null,
        cookiesPath: null,
        extraMeta: null,
      });
      setFormats(result.formats || []);
      setActiveTab('url');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const savePath = await invoke<string>('get_default_save_path');
      await invoke('add_download', {
        url,
        savePath,
        threads: 4,
        category: 'Video',
        extraMeta: JSON.stringify({ source: selectedSite.key, isAdult: true }),
      });
    } catch (err) {
      setError(String(err));
    }
  };

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              <span className="text-3xl">🔞</span>
              Adult Sites Downloader
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Powered by yt-dlp · Supports 1700+ sites · 18+ content
            </p>
          </div>

          <div className="max-w-sm">
            <Label className="text-zinc-300 font-semibold text-sm mb-2 block">Select Site</Label>
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

          <div className="flex border-b border-white/[0.06]">
            <button
              onClick={() => setActiveTab('url')}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'url'
                  ? 'text-pink-400 border-b-2 border-pink-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Direct URL
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'search'
                  ? 'text-pink-400 border-b-2 border-pink-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Search
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {activeTab === 'url' && (
            <div className="space-y-4">
              <div>
                <Label className="text-zinc-300 font-semibold text-sm mb-2 block">Video URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={directUrl}
                    onChange={e => setDirectUrl(e.target.value)}
                    placeholder={`Paste ${selectedSite.displayName} video URL...`}
                    className="flex-1 bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl"
                    onKeyDown={e => e.key === 'Enter' && directUrl.trim() && handleProbeUrl(directUrl)}
                  />
                  <Button
                    onClick={() => handleProbeUrl(directUrl)}
                    disabled={!directUrl.trim() || loading}
                    className="h-11 px-6 bg-pink-600 hover:bg-pink-500 text-white rounded-xl"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Probe'}
                  </Button>
                </div>
              </div>

              {formats.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-zinc-300 font-semibold text-sm">Available Formats</Label>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {formats
                      .filter(f => f.vcodec !== 'none' || f.acodec !== 'none')
                      .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))
                      .slice(0, 15)
                      .map(format => (
                        <div key={format.format_id} className="flex items-center justify-between p-3 bg-zinc-900/30 border border-white/5 rounded-xl">
                          <div>
                            <span className="text-sm text-white font-medium">{format.resolution} · {format.ext.toUpperCase()}</span>
                            <span className="text-xs text-zinc-500 ml-2">
                              {format.vcodec !== 'none' && `V: ${format.vcodec}`}
                              {format.vcodec !== 'none' && format.acodec !== 'none' && ' · '}
                              {format.acodec !== 'none' && `A: ${format.acodec}`}
                              {format.filesize ? ` · ${(format.filesize / 1024 / 1024).toFixed(1)} MB` : ''}
                            </span>
                          </div>
                          <Button
                            onClick={() => handleDownload(directUrl)}
                            className="h-8 px-4 bg-pink-600 hover:bg-pink-500 text-white text-xs rounded-lg"
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
              <div>
                <Label className="text-zinc-300 font-semibold text-sm mb-2 block">Search Query</Label>
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder={`Search ${selectedSite.displayName}...`}
                    className="flex-1 bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={!searchQuery.trim() || loading}
                    className="h-11 px-6 bg-pink-600 hover:bg-pink-500 text-white rounded-xl"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Search className="w-4 h-4 mr-1.5" />}
                    Search
                  </Button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
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
                <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                  {searchResults.map(result => (
                    <div key={result.id} className="flex items-center justify-between p-3 bg-zinc-900/30 border border-white/5 rounded-xl">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {result.thumbnail ? (
                          <img src={result.thumbnail} alt="" className="w-20 h-14 object-cover rounded-lg shrink-0 bg-zinc-800" />
                        ) : (
                          <div className="w-20 h-14 rounded-lg bg-zinc-800 shrink-0" />
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
                        className="h-8 px-4 bg-pink-600 hover:bg-pink-500 text-white text-xs rounded-lg shrink-0 ml-3"
                      >
                        <Download className="w-3 h-3 mr-1.5" />
                        Get
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {!loading && searchResults.length === 0 && (
                <div className="py-12 text-center text-zinc-500 text-sm">
                  {searchQuery ? 'No results found.' : 'Enter a search query to find videos.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
