import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tv, Download, Loader2, AlertCircle, ListVideo } from 'lucide-react';

interface M3UImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface M3uEntry {
  name: string;
  url: string;
  duration?: number;
  group?: string;
  logo?: string;
}

export function M3UImporterModal({ isOpen, onClose }: M3UImporterModalProps) {
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'url' | 'paste'>('url');
  const [entries, setEntries] = useState<M3uEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const importFromUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<M3uEntry[]>('import_m3u_playlist', { url: url.trim() });
      setEntries(result);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : (e?.message || 'Failed to import M3U'));
    } finally {
      setLoading(false);
    }
  };

  const parseFromContent = async () => {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<M3uEntry[]>('parse_m3u_content', { content });
      setEntries(result);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : (e?.message || 'Failed to parse M3U'));
    } finally {
      setLoading(false);
    }
  };

  const addEntry = async (entry: M3uEntry) => {
    try {
      await invoke('add_download', {
        url: entry.url,
        savePath: entry.name,
        threads: 8,
        category: 'Video',
        extraMeta: JSON.stringify({ playlist: true, group: entry.group }),
      });
    } catch (e) {
      console.error('Failed to add entry:', e);
    }
  };

  const addAll = async () => {
    for (const entry of entries) {
      await addEntry(entry);
    }
  };

  const filteredEntries = entries.filter((e) =>
    !filter || e.name.toLowerCase().includes(filter.toLowerCase()) || (e.group?.toLowerCase().includes(filter.toLowerCase()) ?? false)
  );

  const groups = Array.from(new Set(entries.map((e) => e.group).filter(Boolean))) as string[];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] md:max-w-[1000px] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl">
        <div className="p-8 max-h-[85vh] flex flex-col">
          <DialogHeader className="mb-6 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-pink-500/10 rounded-xl">
                <Tv className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">M3U / IPTV Importer</DialogTitle>
                <p className="text-sm text-zinc-500 mt-0.5">Import IPTV playlists and add channels to your queue</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-md text-zinc-500 hover:text-white">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="w-4 h-4">
                <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" />
              </svg>
            </Button>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <Button
              size="sm"
              variant={mode === 'url' ? 'default' : 'ghost'}
              onClick={() => setMode('url')}
              className={mode === 'url' ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-500'}
            >
              From URL
            </Button>
            <Button
              size="sm"
              variant={mode === 'paste' ? 'default' : 'ghost'}
              onClick={() => setMode('paste')}
              className={mode === 'paste' ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-500'}
            >
              Paste Content
            </Button>
          </div>

          {mode === 'url' ? (
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u8"
                  className="bg-zinc-900/50 border-white/10 text-white h-11"
                  onKeyDown={(e) => e.key === 'Enter' && importFromUrl()}
                />
              </div>
              <Button onClick={importFromUrl} disabled={loading || !url.trim()} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
              </Button>
            </div>
          ) : (
            <div className="mb-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="#EXTM3U&#10;#EXTINF:-1,Channel Name&#10;http://..."
                rows={6}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl p-3 text-sm text-white font-mono"
              />
              <Button onClick={parseFromContent} disabled={loading || !content.trim()} className="mt-2 bg-indigo-500 hover:bg-indigo-600 text-white">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Parse
              </Button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {entries.length > 0 && (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter channels..."
                    className="bg-zinc-900/50 border-white/10 text-white h-9"
                  />
                </div>
                <span className="text-xs text-zinc-500 font-mono">
                  {filteredEntries.length} / {entries.length} channels
                </span>
                <Button onClick={addAll} className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/20">
                  <Download className="w-4 h-4 mr-1.5" />
                  Add All
                </Button>
              </div>

              {groups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {groups.slice(0, 10).map((g) => (
                    <button
                      key={g}
                      onClick={() => setFilter(g)}
                      className="text-[10px] uppercase tracking-wider px-2 py-1 bg-zinc-900/50 border border-white/5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto bg-zinc-900/30 border border-white/[0.06] rounded-xl">
                {filteredEntries.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-500">No channels match filter</div>
                ) : (
                  filteredEntries.map((entry, idx) => (
                    <div
                      key={`${entry.url}-${idx}`}
                      className="flex items-center justify-between p-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {entry.logo ? (
                          <img src={entry.logo} alt="" className="w-8 h-8 rounded bg-zinc-800 object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
                            <ListVideo className="w-4 h-4 text-zinc-600" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">{entry.name}</div>
                          <div className="text-xs text-zinc-500 truncate font-mono">{entry.url}</div>
                        </div>
                        {entry.group && (
                          <span className="text-[10px] uppercase tracking-wider text-zinc-600 hidden md:block">{entry.group}</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addEntry(entry)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 hover:text-indigo-300"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {entries.length === 0 && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-zinc-500">
              <Tv className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No playlist loaded yet</p>
              <p className="text-xs mt-1 text-zinc-600">Paste content or enter a URL to begin</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
