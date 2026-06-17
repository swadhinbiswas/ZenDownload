import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, Download, ExternalLink, Loader2, Film, Flame, Eye, FileVideo, HardDrive, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatBytes } from '@/lib/utils';

interface TorrentResult {
  title: string; magnet: string; seeders: number; leechers: number;
  size: string; source: string; url: string; category: string | null;
}

interface TorrentPreview {
  name: string; total_size: number; file_count: number;
  files: { path: string; size: number }[];
}

const SOURCE_COLORS: Record<string, string> = {
  '1337x': 'bg-red-500/10 text-red-400 border-red-500/20',
  'TPB': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'YTS': 'bg-green-500/10 text-green-400 border-green-500/20',
  'TorrentGalaxy': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export function TorrentSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [trending, setTrending] = useState<TorrentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [preview, setPreview] = useState<TorrentPreview | null>(null);
  const [previewMagnet, setPreviewMagnet] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);

  const addToast = (msg: string) => {
    setToasts(prev => [...prev, msg]);
    setTimeout(() => setToasts(prev => prev.filter(m => m !== msg)), 3000);
  };

  useEffect(() => {
    (async () => {
      try {
        const t = await invoke<TorrentResult[]>('discover_torrents');
        setTrending(t);
      } catch { }
      setTrendingLoading(false);
    })();
  }, []);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try { setResults(await invoke<TorrentResult[]>('search_torrents', { query: query.trim() })); }
    catch { setResults([]); }
    finally { setLoading(false); }
  }, [query]);

  const addMagnet = async (magnet: string, title: string) => {
    if (!magnet) { addToast('No magnet link available'); return; }
    try {
      await invoke('add_download', { url: magnet, savePath: '', threads: 8, category: 'Compressed', extraMeta: null });
      addToast('Added: ' + title.slice(0, 60));
    } catch { addToast('Failed to add torrent'); }
  };

  const showPreview = async (magnet: string) => {
    if (!magnet) return;
    setPreviewMagnet(magnet);
    setPreviewLoading(true);
    try { setPreview(await invoke<TorrentPreview>('preview_torrent', { magnet })); }
    catch { setPreview(null); }
    finally { setPreviewLoading(false); }
  };

  const TorrentCard = ({ r, featured }: { r: TorrentResult; featured?: boolean }) => (
    <div className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all ${featured
        ? 'bg-indigo-500/[0.03] border-indigo-500/10 hover:border-indigo-500/20'
        : 'bg-zinc-900/40 border-white/[0.05] hover:border-white/[0.1]'}`}>
      <div className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center ${featured ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-white/[0.04] border-white/[0.06]'}`}>
        {r.category === 'Movies' ? <Film className="w-4 h-4 text-amber-400" /> : <Flame className={`w-4 h-4 ${featured ? 'text-indigo-400' : 'text-zinc-500'}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200 line-clamp-2">{r.title}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge className={`text-[10px] font-bold uppercase border ${SOURCE_COLORS[r.source] || 'bg-zinc-800 text-zinc-400'}`}>{r.source}</Badge>
          <span className="text-[11px] text-zinc-500">{r.size}</span>
          <span className="text-[11px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{r.seeders.toLocaleString()}</span>
          {r.leechers > 0 && <span className="text-[11px] text-red-400">{r.leechers.toLocaleString()} leech</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white" onClick={() => window.open(r.url, '_blank')}><ExternalLink className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10" onClick={() => showPreview(r.magnet)}><Eye className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10" onClick={() => addMagnet(r.magnet, r.title)}><Download className="w-4 h-4" /></Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative">
      {/* Toast notifications */}
      <div className="absolute top-2 right-4 z-50 space-y-1">
        {toasts.map((t, i) => (
          <div key={i} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs animate-in fade-in slide-in-from-right-2">{t}</div>
        ))}
      </div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <Flame className="w-5 h-5 text-indigo-400" />
          <h1 className="text-lg font-semibold text-white tracking-tight">Torrent Search</h1>
        </div>
        <form onSubmit={e => { e.preventDefault(); search(); }} className="flex gap-2">
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search 1337x, TPB, YTS, TorrentGalaxy..."
            className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg text-sm"
            onKeyDown={e => e.key === 'Enter' && search()} />
          <Button onClick={search} disabled={loading} className="h-10 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
          </Button>
        </form>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Trending Section */}
        {!searched && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Trending Now</h2>
            </div>
            {trendingLoading ? (
              <div className="flex items-center justify-center py-12 text-zinc-500 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading trending...</div>
            ) : trending.length > 0 ? (
              <div className="space-y-2">{trending.map((r, i) => <TorrentCard key={i} r={r} featured={i < 5} />)}</div>
            ) : (
              <div className="text-center py-8 text-zinc-600 text-sm">Could not load trending torrents</div>
            )}
          </div>
        )}

        {/* Search Results */}
        {searched && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Results for "{query}"</h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-zinc-500 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Searching 4 providers...</div>
            ) : results.length > 0 ? (
              <div className="space-y-2">{results.map((r, i) => <TorrentCard key={i} r={r} featured={false} />)}</div>
            ) : (
              <div className="text-center py-12 text-zinc-500">
                <Search className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">No results found</p>
                <p className="text-xs text-zinc-600 mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileVideo className="w-5 h-5 text-indigo-400" /> Torrent Preview
            </DialogTitle>
          </DialogHeader>
          {previewLoading ? (
            <div className="py-8 text-center text-zinc-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Resolving metadata...</div>
          ) : preview ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-200">{preview.name || 'Unknown'}</p>
              <div className="flex gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" />{formatBytes(preview.total_size)}</span>
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{preview.file_count} files</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-white/[0.06] rounded-lg p-2 bg-zinc-900/50">
                {preview.files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-white/[0.03]">
                    <span className="text-zinc-400 truncate flex-1 mr-3">{f.path}</span>
                    <span className="text-zinc-600 shrink-0">{formatBytes(f.size)}</span>
                  </div>
                ))}
              </div>
              <Button onClick={() => { addMagnet(previewMagnet, preview.name); setPreview(null); }}
                className="w-full h-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg gap-2 text-sm">
                <Download className="w-4 h-4" /> Download Torrent
              </Button>
            </div>
          ) : (
            <div className="py-4 text-center text-zinc-500">Could not resolve torrent metadata</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
