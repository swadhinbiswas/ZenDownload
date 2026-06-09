import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { buildProxyUrl } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface StreamFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  vcodec: string;
  acodec: string;
}

interface StreamMetadata {
  title: string;
  thumbnail: string | null;
  formats: StreamFormat[];
}

export function StreamQualityPicker({ isOpen, onClose, initialUrl = '' }: { isOpen: boolean; onClose: () => void, initialUrl?: string }) {
  const addDownload = useDownloadStore((state) => state.addDownload);
  const browserForCookies = useSettingsStore((state) => state.browserForCookies);
  const cookiesPath = useSettingsStore((state) => state.cookiesPath);
  const pathVideo = useSettingsStore((state) => state.pathVideo);
  const pathGeneral = useSettingsStore((state) => state.pathGeneral);

  const [url, setUrl] = useState(initialUrl);
  const [savePath, setSavePath] = useState(pathVideo || pathGeneral || '/tmp');
  const [probing, setProbing] = useState(false);
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
      if (isOpen) {
          setUrl(initialUrl);
          setError('');
          setMetadata(null);
          if (!savePath) setSavePath(pathVideo || pathGeneral || '/tmp');
          // If initialUrl is provided and valid, auto-probe
          if (initialUrl) {
              handleProbeForUrl(initialUrl);
          }
      }
  }, [isOpen, initialUrl]);

  const handleProbeForUrl = async (targetUrl: string) => {
    if (!targetUrl) return;
    setProbing(true);
    setError('');
    setMetadata(null);
    try {
      const data = await invoke<StreamMetadata>('probe_stream_url', { 
          url: targetUrl,
          browserForCookies: browserForCookies !== 'none' ? browserForCookies : null,
          cookiesPath: cookiesPath || null
      });
      setMetadata(data);
      
      // Auto-select based on defaultStreamFormat settings (simplistic check to match height/audio limit, fallback to first/best)
      if (data.formats.length > 0) {
        setSelectedFormat(data.formats[0].format_id);
      }
      
      if (!savePath) {
        setSavePath(pathVideo || pathGeneral || '/tmp');
      }
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setProbing(false);
    }
  };

  const handleProbe = () => handleProbeForUrl(url);

  const handleStart = async () => {
    if (!url || !savePath || !selectedFormat) return;
    try {
      // Create specific format selector string explicitly picking video+audio for selected format, or bestaudio if it's audio only
      const targetFormat = metadata?.formats.find(f => f.format_id === selectedFormat);
      let formatArg = `${selectedFormat}+bestaudio/best`; // standard video+audio merging
      
      if (targetFormat && targetFormat.vcodec === 'none') {
        formatArg = selectedFormat; // audio only format
      }
      
      const extraMeta = JSON.stringify({
          format: formatArg,
          browserForCookies: browserForCookies !== 'none' ? browserForCookies : null,
          cookiesPath: cookiesPath || null,
          proxyUrl: buildProxyUrl(useSettingsStore.getState()),
      });

      await addDownload(url, savePath, 8, 'Video', extraMeta);
      onClose();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  function formatBytes(bytes: number) {
    if (!bytes || isNaN(bytes)) return '? MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[700px] w-[95vw] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh]">
        <div className="relative flex flex-col h-full min-h-0">
          <div className="flex justify-end p-3 absolute top-0 right-0 z-20">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06]" onClick={onClose}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            </Button>
          </div>

          <div className="p-6 md:px-7 md:pt-6 md:pb-5 relative z-10 flex flex-col h-full flex-1 min-h-0">
            <DialogHeader className="mb-4 text-left space-y-1 shrink-0">
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">Stream Extractor</DialogTitle>
            </DialogHeader>

            <div className="flex-1 flex flex-col space-y-4 md:space-y-6 overflow-hidden min-h-0">
              <div className="flex gap-2 md:gap-3 shrink-0">
                <Input 
                    value={url} 
                    onChange={(e) => setUrl(e.target.value)} 
                    placeholder="https://youtube.com/watch?v=..." 
                    className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg focus-visible:ring-indigo-500/50 text-[13px]"
                />
                <Button onClick={handleProbe} disabled={probing || !url} className="px-5 h-10 font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px]">
                    {probing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Probe'}
                </Button>
              </div>
              
              {error && <div className="text-red-400 text-[13px] bg-red-500/[0.06] p-3 rounded-lg border border-red-500/20 shrink-0">{error}</div>}

              {metadata && (
              <div className="flex-1 flex flex-col space-y-4 md:space-y-5 overflow-hidden min-h-0">
                <div className="flex gap-4 items-start p-3 rounded-lg bg-zinc-900/30 border border-white/[0.06] shrink-0">
                    {metadata.thumbnail && (
                        <div className="rounded-lg overflow-hidden border border-white/[0.06] shrink-0 w-[120px]">
                            <img src={metadata.thumbnail} alt="Thumbnail" className="w-full aspect-video object-cover" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-[14px] text-white truncate leading-tight">{metadata.title}</h4>
                        <p className="text-[12px] text-zinc-500 mt-1">Select quality below to download.</p>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 flex-1 overflow-y-auto pr-1 pb-1">
                    {metadata.formats.map(fmt => (
                        <div 
                            key={fmt.format_id}
                            onClick={() => setSelectedFormat(fmt.format_id)}
                            className={`p-3 border rounded-lg cursor-pointer transition-all duration-150 flex flex-col justify-between ${
                                selectedFormat === fmt.format_id 
                                    ? 'border-indigo-500/50 bg-indigo-500/[0.06]' 
                                    : 'border-white/[0.06] bg-zinc-900/30 hover:border-white/[0.12] hover:bg-white/[0.02]'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-semibold text-[13px] text-zinc-100">{fmt.resolution}</span>
                                <Badge variant="outline" className={`text-[10px] ${selectedFormat === fmt.format_id ? 'border-indigo-500/50 text-indigo-300 bg-indigo-500/10' : 'border-white/[0.08] text-zinc-500 bg-zinc-800/50'}`}>
                                    {fmt.ext}
                                </Badge>
                            </div>
                            <div className="text-[11px] text-zinc-500 space-y-1">
                                <div className="flex justify-between">
                                    <span>Size</span>
                                    <span className="text-zinc-300 font-mono">{fmt.filesize ? formatBytes(fmt.filesize) : '?'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Video</span>
                                    <span className="truncate ml-2 text-zinc-400 max-w-[80px] text-right">{fmt.vcodec}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Audio</span>
                                    <span className="truncate ml-2 text-zinc-400 max-w-[80px] text-right">{fmt.acodec}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
              )}

              <div className="pt-2 shrink-0">
                 <Label className="mb-1.5 block text-zinc-400 font-medium text-[13px]">Save Location</Label>
                 <div className="flex gap-2">
                    <Input value={savePath} readOnly className="flex-1 bg-zinc-900/50 border-white/[0.08] text-zinc-500 h-10 rounded-lg font-mono text-[11px]" />
                    <Button type="button" variant="secondary" className="px-4 h-10 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg border border-white/[0.06] font-medium text-[13px]" onClick={async () => {
                        const selected = await open({ directory: true, multiple: false });
                        if (selected) setSavePath(selected as string);
                    }}>
                        Browse
                    </Button>
                 </div>
              </div>
            </div>
            
            <DialogFooter className="mt-4 pt-4 border-t border-white/[0.06] shrink-0">
              <div className="flex w-full justify-end gap-2">
                <Button variant="outline" className="px-5 h-9 font-medium rounded-lg bg-transparent border-white/[0.08] hover:bg-white/[0.04] text-zinc-400 text-[13px]" onClick={onClose}>Cancel</Button>
                <Button className="px-6 h-9 font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px]" onClick={handleStart} disabled={!selectedFormat || !savePath}>Download</Button>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
