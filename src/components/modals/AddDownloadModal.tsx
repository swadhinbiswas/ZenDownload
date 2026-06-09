import { useState, useEffect } from 'react';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildProxyUrl, isPlaylistUrl, sanitizeFilename } from '@/lib/utils';
import { LinkChecker } from '../ui/LinkChecker';

interface AddDownloadModalProps {
  initialUrl?: string;
  isOpen: boolean;
  onClose: () => void;
  onSwitchToStream?: (url: string) => void;
}

const directFileExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'exe', 'msi', 'apk', 'dmg', 'iso', 'pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'mp4', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];

const isDirectFile = (url: string) => {
    try {
        const cleanUrl = url.split('?')[0];
        const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';
        return directFileExtensions.includes(ext);
    } catch {
        return false;
    }
}

const isMagnetLink = (url: string) => url.startsWith('magnet:');
const isTorrentUrl = (url: string) => {
    try {
        const cleanUrl = url.split('?')[0];
        return cleanUrl.endsWith('.torrent');
    } catch {
        return false;
    }
}

export function AddDownloadModal({ isOpen, onClose, onSwitchToStream, initialUrl = "" }: AddDownloadModalProps) {
  const addDownload = useDownloadStore((state) => state.addDownload);
  const addTorrentFile = useDownloadStore((state) => state.addTorrentFile);
  const defaultStreamFormat = useSettingsStore((state) => state.defaultStreamFormat);
  const browserForCookies = useSettingsStore((state) => state.browserForCookies);
  const cookiesPath = useSettingsStore((state) => state.cookiesPath);
  const proxyType = useSettingsStore((state) => state.proxyType);
  const proxyHost = useSettingsStore((state) => state.proxyHost);
  const proxyPort = useSettingsStore((state) => state.proxyPort);
  const proxyUsername = useSettingsStore((state) => state.proxyUsername);
  const proxyPassword = useSettingsStore((state) => state.proxyPassword);
  const pathGeneral = useSettingsStore((state) => state.pathGeneral);
  const pathVideo = useSettingsStore((state) => state.pathVideo);

  const [url, setUrl] = useState(initialUrl);
  useEffect(() => {
    if (isOpen) {
        setUrl(initialUrl);
    }
  }, [isOpen, initialUrl]);
  const [savePath, setSavePath] = useState(pathGeneral || '/tmp'); 
  const [threads, setThreads] = useState('8');
  const [category, setCategory] = useState('General');
  const [torrentFilePath, setTorrentFilePath] = useState<string | null>(null);
  const [postProcessAction, setPostProcessAction] = useState('None');
  const [downloadMode, setDownloadMode] = useState<'auto' | 'video' | 'audio' | 'playlist'>('auto');

  const isTorrentInput = isMagnetLink(url) || isTorrentUrl(url);
  const resolvedMode = downloadMode === 'auto'
    ? (isPlaylistUrl(url) ? 'playlist' : (url.startsWith('http') && !isDirectFile(url) ? 'video' : 'file'))
    : downloadMode;

  // Auto-detect stream and switch to video category
  useEffect(() => {
      if (url && url.startsWith('http') && !isDirectFile(url) && !isTorrentInput && !isPlaylistUrl(url)) {
          setCategory('Video');
      }
  }, [url, isTorrentInput]);

  // Update savePath when category changes to auto-route
  useEffect(() => {
      if (category === 'Video' && pathVideo) {
          setSavePath(pathVideo);
      } else if (pathGeneral) {
          setSavePath(pathGeneral);
      }
  }, [category, pathVideo, pathGeneral]);

  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setError('');

    // Handle local .torrent file
    if (torrentFilePath && url === torrentFilePath) {
        try {
            await addTorrentFile(url, savePath);
            setUrl('');
            setTorrentFilePath(null);
            onClose();
        } catch (err: any) {
            setError(typeof err === 'string' ? err : err?.message || 'Failed to add torrent');
        }
        return;
    }

    // Auto generate a dummy save path for MVP
    let filename = url.split('/').pop() || 'downloaded_file';
    if (filename.includes('?')) filename = filename.split('?')[0];

    // Decode percent-encoded spaces like %20 natively
    try {
        filename = decodeURIComponent(filename);
    } catch (e) {
        // Fallback safely if decode breaks
    }
    filename = sanitizeFilename(filename);

    // Fix double slashes in path
    const safeSavePath = savePath.replace(/[/\\]$/, '');
    const finalPath = `${safeSavePath}/${filename}`;

    const extraMeta = JSON.stringify({
      format: defaultStreamFormat,
      browserForCookies: browserForCookies !== 'none' ? browserForCookies : null,
      cookiesPath: cookiesPath || null,
      proxyUrl: buildProxyUrl({ proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword }),
      postProcessAction: postProcessAction
    });

    try {
        await addDownload(url, resolvedMode === 'playlist' ? finalPath.replace(/\.[^.]+$/, '') : finalPath, parseInt(threads), resolvedMode === 'audio' ? 'Music' : category, extraMeta);
        setUrl('');
        onClose();
    } catch (err: any) {
        setError(typeof err === 'string' ? err : err?.message || 'Failed to add download');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-[480px] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl">
        <div className="relative">
          <div className="flex justify-end p-3 absolute top-0 right-0 z-20">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06]" onClick={onClose}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            </Button>
          </div>

          <div className="px-6 pt-6 pb-5">
            <DialogHeader className="mb-5 text-left space-y-1">
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">New Download</DialogTitle>
              <DialogDescription className="text-[13px] text-zinc-500">
                Enter the URL and configure the download.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="url" className="text-zinc-400 font-medium text-[13px]">
                      URL
                    </Label>
                    {isTorrentInput && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">BitTorrent</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="url"
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); setError(''); }}
                      placeholder="https://example.com/file.zip"
                      className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg focus-visible:ring-indigo-500/50 text-[13px]"
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 h-10 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg border border-white/[0.06] font-medium text-[13px]"
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const selected = await open({
                            directory: false,
                            multiple: false,
                            filters: [{ name: 'Torrent files', extensions: ['torrent'] }]
                          });
                          if (selected) {
                            setUrl(selected as string);
                            setTorrentFilePath(selected as string);
                          }
                        } catch (err) {
                          console.error('Failed to open dialog:', err);
                        }
                      }}
                      title="Open .torrent file"
                    >
                      .torrent
                    </Button>
                  </div>
                </div>
                
                {url.trim() && url.startsWith('http') && (
                  <LinkChecker url={url} />
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="category" className="text-zinc-400 font-medium text-[13px]">
                      Category
                    </Label>
                    <Select value={category} onValueChange={(val) => setCategory(val || 'General')}>
                      <SelectTrigger className="w-full bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg text-[13px]">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Documents">Documents</SelectItem>
                        <SelectItem value="Video">Video</SelectItem>
                        <SelectItem value="Music">Music</SelectItem>
                        <SelectItem value="Programs">Programs</SelectItem>
                        <SelectItem value="Compressed">Compressed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="threads" className="text-zinc-400 font-medium text-[13px]">
                      Connections
                    </Label>
                    <Input
                      id="threads"
                      type="number"
                      min="1"
                      max="32"
                      value={threads}
                      onChange={(e) => setThreads(e.target.value)}
                      className="w-full bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg focus-visible:ring-indigo-500/50 text-[13px]"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="mode" className="text-zinc-400 font-medium text-[13px]">
                    Download Mode
                  </Label>
                  <Select value={downloadMode} onValueChange={(val) => setDownloadMode(val as typeof downloadMode)}>
                    <SelectTrigger className="w-full bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg text-[13px]">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="auto">Auto Detect</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio">Audio Only</SelectItem>
                      <SelectItem value="playlist">Playlist / Channel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-400 font-medium text-[13px]">Save Location</Label>
                  <div className="flex gap-2">
                    <Input 
                        value={savePath} 
                        readOnly 
                        className="flex-1 bg-zinc-900/50 border-white/[0.08] text-zinc-500 h-10 rounded-lg font-mono text-[11px]" 
                    />
                    <Button 
                        type="button" 
                        variant="secondary" 
                        className="px-4 h-10 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg border border-white/[0.06] font-medium text-[13px]"
                        onClick={async (e) => {
                        e.preventDefault();
                        try {
                            const selected = await open({ directory: true, multiple: false });
                            if (selected) setSavePath(selected as string);
                        } catch (err) {
                            console.error('Failed to open dialog:', err);
                        }
                    }}>
                        Browse
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="postProcessAction" className="text-zinc-400 font-medium text-[13px]">
                    Post-Processing
                  </Label>
                  <Select value={postProcessAction} onValueChange={(val) => setPostProcessAction(val || 'None')}>
                    <SelectTrigger className="w-full bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg text-[13px]">
                      <SelectValue placeholder="No processing" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      <SelectItem value="None">None (Original File)</SelectItem>
                      <SelectItem value="ConvertToMp4">Convert Video to MP4</SelectItem>
                      <SelectItem value="ExtractAudio">Extract Audio to MP3</SelectItem>
                      <SelectItem value="ExtractArchive">Extract Archive (ZIP/RAR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
               {url.startsWith('http') && !isDirectFile(url) && onSwitchToStream && resolvedMode !== 'playlist' && (
                  <div className="p-3 bg-indigo-500/[0.06] text-indigo-300 rounded-lg border border-indigo-500/20 flex items-center justify-between">
                    <div className="text-[13px] font-medium">This looks like a streaming or playlist page.</div>
                      <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white h-8 px-3 text-[12px] font-medium" onClick={() => { onSwitchToStream(url); setUrl(''); }}>
                          Extract Video
                      </Button>
                  </div>
              )}

              {error && (
                 <div className="p-3 bg-red-500/[0.06] text-red-300 rounded-lg border border-red-500/20">
                    <div className="text-[13px] font-medium whitespace-pre-line">{error}</div>
                 </div>
              )}

              <div className="pt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" className="px-5 h-9 font-medium rounded-lg bg-transparent border-white/[0.08] hover:bg-white/[0.04] text-zinc-400 text-[13px]" onClick={onClose}>
                  Cancel
                </Button>
                 <Button type="submit" className="px-6 h-9 font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px]">
                   {resolvedMode === 'playlist' ? 'Download Playlist' : url.startsWith('http') && !isDirectFile(url) ? 'Auto Download' : 'Start Download'}
                 </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
