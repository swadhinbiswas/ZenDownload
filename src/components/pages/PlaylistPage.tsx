import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDownloadStore } from '@/stores/downloadStore';
import { sanitizeFilename } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ListVideo, Play, Search, AlertCircle } from 'lucide-react';

type PlaylistEntry = {
  id: string;
  title: string;
  url: string;
  index: number;
  thumbnail?: string | null;
};

type PlaylistMetadata = {
  id: string;
  title: string;
  entries: PlaylistEntry[];
  entry_count: number;
};

export function PlaylistPage() {
  const addDownload = useDownloadStore(state => state.addDownload);
  const pathVideo = useSettingsStore(state => state.pathVideo);
  const pathGeneral = useSettingsStore(state => state.pathGeneral);
  const browserForCookies = useSettingsStore(state => state.browserForCookies);
  const cookiesPath = useSettingsStore(state => state.cookiesPath);

  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState<PlaylistMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savePath, setSavePath] = useState('');
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('0');

  useEffect(() => {
    setSavePath(pathVideo || pathGeneral || '/tmp');
  }, [pathVideo, pathGeneral]);

  const fetchPlaylist = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await invoke<PlaylistMetadata>('probe_playlist_url', {
        url: url.trim(),
        browserForCookies: browserForCookies !== 'none' ? browserForCookies : null,
        cookiesPath: cookiesPath || null,
      });
      setMetadata(data);
      setSelected(new Set(data.entries.map(entry => entry.url)));
      setRangeEnd(String(data.entries.length));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const selectedEntries = useMemo(() => {
    if (!metadata) return [] as PlaylistEntry[];
    return metadata.entries.filter(entry => selected.has(entry.url));
  }, [metadata, selected]);

  const toggleEntry = (entryUrl: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(entryUrl)) next.delete(entryUrl);
      else next.add(entryUrl);
      return next;
    });
  };

  const selectRange = () => {
    if (!metadata) return;
    const start = Math.max(1, parseInt(rangeStart || '1', 10));
    const end = Math.max(start, parseInt(rangeEnd || String(metadata.entries.length), 10));
    const chosen = metadata.entries
      .filter(entry => entry.index >= start && entry.index <= end)
      .map(entry => entry.url);
    setSelected(new Set(chosen));
  };

  const handleDownload = async () => {
    if (!metadata || selectedEntries.length === 0) return;

    const baseDir = savePath.replace(/[\\/]+$/, '');
    const folder = sanitizeFilename(metadata.title || 'Playlist');
    const targetDir = `${baseDir}/${folder}`;

    for (const entry of selectedEntries) {
      const safeTitle = sanitizeFilename(entry.title || `Item ${entry.index}`);
      await addDownload(entry.url, `${targetDir}/${String(entry.index).padStart(2, '0')} - ${safeTitle}`, 8, 'Video', JSON.stringify({
        browserForCookies: browserForCookies !== 'none' ? browserForCookies : null,
        cookiesPath: cookiesPath || null,
        format: 'bestvideo+bestaudio/best',
        isPlaylistItem: true,
        downloadPlaylist: true,
        playlistStart: entry.index,
        playlistEnd: entry.index,
      }));
    }

    useDownloadStore.getState().setCurrentView('downloads');
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E&quot;)] opacity-5 mix-blend-overlay pointer-events-none z-0"></div>
      
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.04] bg-zinc-950 shrink-0 z-10">
        <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
          <ListVideo className="w-5 h-5 text-indigo-400" />
          Playlist Downloader
        </h2>
        <p className="text-xs text-zinc-500 mt-1">Extract channels, video collections, or search feeds, select ranges, and batch-queue media.</p>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 z-10">
        
        {/* Form controls sidebar */}
        <div className="w-full md:w-[320px] border-r border-white/[0.04] bg-zinc-950/40 p-5 space-y-5 overflow-y-auto shrink-0">
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Playlist or Feed Link</label>
            <Input 
              value={url} 
              onChange={(e) => setUrl(e.target.value)} 
              placeholder="Paste playlist, channel or search URL..." 
              className="bg-zinc-900/40 border-white/[0.08] text-white focus-visible:ring-indigo-500/50 text-[13px]"
            />
          </div>

          <Button onClick={fetchPlaylist} disabled={loading || !url.trim()} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/10">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Search className="w-4 h-4 mr-1.5" />}
            Probe Link
          </Button>

          {error && (
            <div className="text-red-400 text-xs bg-red-500/[0.06] p-3 rounded-lg border border-red-500/20 flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {metadata && (
            <div className="border-t border-white/[0.04] pt-4 space-y-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Range Selector</h4>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">From Index</label>
                  <Input value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="bg-zinc-900/40 border-white/[0.08] text-white text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">To Index</label>
                  <Input value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="bg-zinc-900/40 border-white/[0.08] text-white text-xs" />
                </div>
              </div>

              <Button variant="secondary" size="sm" onClick={selectRange} className="w-full bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06] text-xs font-semibold">
                Apply Range Select
              </Button>

              <div className="text-[11.5px] text-zinc-500 bg-zinc-900/20 p-2.5 rounded-lg border border-white/[0.02] flex justify-between font-mono">
                <span>Selected:</span>
                <span className="text-indigo-400 font-bold">{selected.size}/{metadata.entries.length} items</span>
              </div>
            </div>
          )}

          <div className="border-t border-white/[0.04] pt-4 space-y-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Save Location</label>
            <div className="flex gap-2">
              <Input value={savePath} readOnly className="h-8 text-[10px] font-mono bg-zinc-900/40 border-white/[0.08] text-zinc-500 focus-visible:ring-0 flex-1" />
              <Button variant="secondary" size="sm" className="h-8 px-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06]" onClick={async () => {
                const selectedPath = await open({ directory: true, multiple: false });
                if (selectedPath) setSavePath(selectedPath as string);
              }}>
                Browse
              </Button>
            </div>
          </div>
        </div>

        {/* List of elements panel */}
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
          {!metadata ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3 text-center max-w-sm mx-auto">
              <Play className="w-12 h-12 text-zinc-800" />
              <div>
                <p className="text-sm font-semibold text-zinc-400">Load playlist items</p>
                <p className="text-xs text-zinc-600 mt-1">Configure feed details in the left panel to fetch target indexing streams.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Header metrics */}
              <div className="px-6 py-3 border-b border-white/[0.04] bg-zinc-950 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-bold text-white truncate max-w-lg">{metadata.title || 'Playlist Media'}</h3>
                <span className="text-xs text-zinc-500 font-mono font-medium">({metadata.entries.length} streams loaded)</span>
              </div>

              {/* Items scroller */}
              <div className="flex-1 overflow-y-auto p-6 space-y-2 min-h-0">
                {metadata.entries.map((entry) => {
                  const isSelected = selected.has(entry.url);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => toggleEntry(entry.url)}
                      className={`w-full flex items-center gap-4 px-4 py-2.5 rounded-lg border text-left transition-all duration-150 ${
                        isSelected 
                          ? 'bg-indigo-500/5 border-indigo-500/20' 
                          : 'bg-zinc-900/10 border-white/[0.04] hover:bg-white/[0.02] hover:border-white/[0.08]'
                      }`}
                    >
                      <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => toggleEntry(entry.url)} 
                        className={isSelected ? "border-indigo-500 data-[state=checked]:bg-indigo-500 data-[state=checked]:text-white" : "border-zinc-700"}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="w-12 h-8 rounded bg-zinc-900/60 border border-white/[0.04] flex items-center justify-center text-[10.5px] font-mono font-semibold text-zinc-500 shrink-0">
                        #{entry.index}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-zinc-200 truncate">{entry.title}</div>
                        <div className="text-[10.5px] text-zinc-500 truncate mt-0.5">{entry.url}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Download trigger footer */}
              <div className="px-6 py-4 border-t border-white/[0.04] bg-zinc-950 flex items-center justify-between shrink-0">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  {selectedEntries.length} items queued for batch extraction
                </div>
                <Button onClick={handleDownload} disabled={selectedEntries.length === 0} className="px-6 h-10 font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all text-[13px]">
                  Download Selected Items
                </Button>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
