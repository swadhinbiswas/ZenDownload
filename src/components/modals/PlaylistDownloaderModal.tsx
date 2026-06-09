import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDownloadStore } from '@/stores/downloadStore';
import { sanitizeFilename } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, ListVideo, Play, Search, FolderOpen } from 'lucide-react';

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

export function PlaylistDownloaderModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
  const [savePath, setSavePath] = useState(pathVideo || pathGeneral || '/tmp');
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('0');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setMetadata(null);
      setSelected(new Set());
      setRangeStart('1');
      setRangeEnd('0');
      setSavePath(pathVideo || pathGeneral || '/tmp');
    }
  }, [isOpen, pathVideo, pathGeneral]);

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

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[920px] w-[96vw] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl max-h-[90vh]">
        <div className="relative flex flex-col h-[88vh]">
          <div className="flex justify-end p-3 absolute top-0 right-0 z-20">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06]" onClick={onClose}>
              ×
            </Button>
          </div>

          <div className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
                <ListVideo className="w-5 h-5 text-indigo-400" />
                Playlist Downloader
              </DialogTitle>
              <DialogDescription className="text-[13px] text-zinc-500">
                Probe a playlist, channel, search result, or video list, then choose a range or individual items.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex gap-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste playlist, channel, or search-result URL" className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg focus-visible:ring-indigo-500/50 text-[13px]" />
                <Button onClick={fetchPlaylist} disabled={loading || !url.trim()} className="px-4 h-10 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] rounded-lg">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="ml-2">Probe</span>
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-[12px] text-zinc-500">
                <span>Range</span>
                <Input value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="w-20 h-8 bg-zinc-900/50 border-white/[0.08] text-white rounded-lg text-[12px]" />
                <span>to</span>
                <Input value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="w-20 h-8 bg-zinc-900/50 border-white/[0.08] text-white rounded-lg text-[12px]" />
                <Button variant="secondary" onClick={selectRange} className="h-8 px-3 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg border border-white/[0.06]">
                  Select Range
                </Button>
                {metadata && (
                  <Badge variant="outline" className="border-white/[0.08] text-zinc-400 bg-zinc-900/50">
                    {selected.size}/{metadata.entries.length} selected
                  </Badge>
                )}
              </div>

              {error && <div className="text-red-400 text-[13px] bg-red-500/[0.06] p-3 rounded-lg border border-red-500/20">{error}</div>}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {!metadata ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3">
                <Play className="w-10 h-10 text-zinc-700" />
                <p className="text-sm">Probe a playlist to load its items</p>
              </div>
            ) : (
              <div className="space-y-2">
                {metadata.entries.map((entry) => {
                  const isSelected = selected.has(entry.url);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => toggleEntry(entry.url)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${isSelected ? 'bg-indigo-500/[0.08] border-indigo-500/20' : 'bg-zinc-900/30 border-white/[0.06] hover:bg-white/[0.02]'}`}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleEntry(entry.url)} className="shrink-0" />
                      <div className="w-12 h-8 rounded bg-zinc-800 flex items-center justify-center text-[11px] text-zinc-500 shrink-0">
                        #{entry.index}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-zinc-100 truncate">{entry.title}</div>
                        <div className="text-[11px] text-zinc-500 truncate">{entry.url}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 py-4 border-t border-white/[0.06] flex items-center gap-2 shrink-0">
            <Input value={savePath} readOnly className="flex-1 bg-zinc-900/50 border-white/[0.08] text-zinc-400 h-10 rounded-lg font-mono text-[11px]" />
            <Button type="button" variant="secondary" className="px-4 h-10 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg border border-white/[0.06]" onClick={async () => {
              const selectedPath = await open({ directory: true, multiple: false });
              if (selectedPath) setSavePath(selectedPath as string);
            }}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Browse
            </Button>
            <Button onClick={handleDownload} disabled={!metadata || selectedEntries.length === 0} className="px-5 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">
              Download Selected
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
