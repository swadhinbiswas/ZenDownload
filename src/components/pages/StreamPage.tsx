import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { buildProxyUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, MonitorPlay, FolderOpen, Play, AlertCircle } from 'lucide-react';

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

export function StreamPage({ initialUrl = '' }: { initialUrl?: string }) {
  const addDownload = useDownloadStore((state) => state.addDownload);
  const browserForCookies = useSettingsStore((state) => state.browserForCookies);
  const cookiesPath = useSettingsStore((state) => state.cookiesPath);
  const pathVideo = useSettingsStore((state) => state.pathVideo);
  const pathGeneral = useSettingsStore((state) => state.pathGeneral);

  const [url, setUrl] = useState(initialUrl);
  const [savePath, setSavePath] = useState('');
  const [probing, setProbing] = useState(false);
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSavePath(pathVideo || pathGeneral || '/tmp');
  }, [pathVideo, pathGeneral]);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      handleProbeForUrl(initialUrl);
    }
  }, [initialUrl]);

  const handleProbeForUrl = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    setProbing(true);
    setError('');
    setMetadata(null);
    try {
      const data = await invoke<StreamMetadata>('probe_stream_url', { 
          url: targetUrl.trim(),
          browserForCookies: browserForCookies !== 'none' ? browserForCookies : null,
          cookiesPath: cookiesPath || null
      });
      setMetadata(data);
      if (data.formats.length > 0) {
        setSelectedFormat(data.formats[0].format_id);
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
      const targetFormat = metadata?.formats.find(f => f.format_id === selectedFormat);
      let formatArg = `${selectedFormat}+bestaudio/best`;
      
      if (targetFormat && targetFormat.vcodec === 'none') {
        formatArg = selectedFormat;
      }
      
      const extraMeta = JSON.stringify({
          format: formatArg,
          browserForCookies: browserForCookies !== 'none' ? browserForCookies : null,
          cookiesPath: cookiesPath || null,
          proxyUrl: buildProxyUrl(useSettingsStore.getState()),
      });

      await addDownload(url, savePath, 8, 'Video', extraMeta);
      
      // Navigate to download list
      useDownloadStore.getState().setCurrentView('downloads');
    } catch (e: any) {
      setError(e.toString());
    }
  };

  function formatBytes(bytes: number) {
    if (!bytes || isNaN(bytes)) return '? MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E&quot;)] opacity-5 mix-blend-overlay pointer-events-none z-0"></div>
      
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.04] bg-zinc-950 shrink-0 z-10">
        <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
          <MonitorPlay className="w-5 h-5 text-indigo-400" />
          Stream Downloader
        </h2>
        <p className="text-xs text-zinc-500 mt-1">Extract high-resolution media from video streams natively using yt-dlp & ffmpeg pipelines.</p>
      </div>

      {/* Main Form Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 z-10 max-w-4xl w-full mx-auto">
        <div className="flex gap-3">
          <Input 
            value={url} 
            onChange={(e) => setUrl(e.target.value)} 
            placeholder="Paste stream link (YouTube, Twitch, TikTok, Facebook, Instagram, X/Twitter, Threads, or .m3u8 playlist URL)" 
            className="flex-1 bg-zinc-900/40 border-white/[0.08] text-white h-11 rounded-lg focus-visible:ring-indigo-500/50 text-[13px]"
          />
          <Button onClick={handleProbe} disabled={probing || !url} className="px-6 h-11 font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] shadow-lg shadow-indigo-600/25 shrink-0">
            {probing ? <Loader2 className="mr-2 h-4 w-4 animate-spin animate-infinite" /> : 'Probe Link'}
          </Button>
        </div>

        {error && (
          <div className="text-red-400 text-[13px] bg-red-500/[0.06] p-4 rounded-xl border border-red-500/20 flex gap-2.5 items-start">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Extraction Failed</p>
              <p className="mt-0.5 text-zinc-400">{error}</p>
            </div>
          </div>
        )}

        {metadata && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex gap-4 items-start p-4 rounded-xl bg-zinc-900/20 border border-white/[0.06] shrink-0">
              {metadata.thumbnail && (
                <div className="rounded-lg overflow-hidden border border-white/[0.06] shrink-0 w-[140px]">
                  <img src={metadata.thumbnail} alt="Thumbnail" className="w-full aspect-video object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-[15px] text-white truncate leading-tight">{metadata.title}</h4>
                <p className="text-[12px] text-zinc-500 mt-1">Found formats. Pick your target download resolution below.</p>
              </div>
            </div>

            {/* Formats Selection Grid */}
            <div className="space-y-2">
              <Label className="text-zinc-400 font-semibold text-xs uppercase tracking-wider block">Available Formats</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {metadata.formats.map(fmt => (
                  <div 
                    key={fmt.format_id}
                    onClick={() => setSelectedFormat(fmt.format_id)}
                    className={`p-3.5 border rounded-xl cursor-pointer transition-all duration-150 flex flex-col justify-between ${
                      selectedFormat === fmt.format_id 
                        ? 'border-indigo-500 bg-indigo-500/[0.06] shadow-md shadow-indigo-500/5' 
                        : 'border-white/[0.06] bg-zinc-900/20 hover:border-white/10 hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-[13px] text-zinc-100">{fmt.resolution}</span>
                      <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider px-1.5 ${selectedFormat === fmt.format_id ? 'border-indigo-500/50 text-indigo-300 bg-indigo-500/10' : 'border-white/[0.08] text-zinc-500 bg-zinc-800/50'}`}>
                        {fmt.ext}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-zinc-500 space-y-1.5 pt-1.5 border-t border-white/[0.04]">
                      <div className="flex justify-between">
                        <span>Size</span>
                        <span className="text-zinc-300 font-mono font-medium">{fmt.filesize ? formatBytes(fmt.filesize) : '?'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Video Codec</span>
                        <span className="truncate ml-2 text-zinc-400 max-w-[90px] text-right font-mono">{fmt.vcodec !== 'none' ? fmt.vcodec : 'None (Audio)'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Audio Codec</span>
                        <span className="truncate ml-2 text-zinc-400 max-w-[90px] text-right font-mono">{fmt.acodec !== 'none' ? fmt.acodec : 'None'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Save Path configuration */}
        <div className="space-y-2 pt-2">
          <Label className="text-zinc-400 font-semibold text-xs uppercase tracking-wider block">Save Location</Label>
          <div className="flex gap-3">
            <Input value={savePath} readOnly className="flex-1 bg-zinc-900/40 border-white/[0.08] text-zinc-400 h-10 rounded-lg font-mono text-[12px]" />
            <Button type="button" variant="secondary" className="px-5 h-10 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg border border-white/[0.06] font-semibold text-[13px]" onClick={async () => {
              const selected = await open({ directory: true, multiple: false });
              if (selected) setSavePath(selected as string);
            }}>
              <FolderOpen className="w-4 h-4 mr-1.5" />
              Browse
            </Button>
          </div>
        </div>
      </div>

      {/* Footer trigger */}
      <div className="px-6 py-4 border-t border-white/[0.04] bg-zinc-950 flex justify-end gap-3 shrink-0 z-10">
        <Button 
          className="px-8 h-10 font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] shadow-lg shadow-indigo-600/25 transition-all" 
          onClick={handleStart} 
          disabled={!selectedFormat || !savePath}
        >
          <Play className="w-4 h-4 mr-1.5" />
          Start Stream Download
        </Button>
      </div>
    </div>
  );
}
