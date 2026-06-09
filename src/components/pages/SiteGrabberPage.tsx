import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Search, Globe, Download, Loader2, FileText, FileVideo, FileMusic, FileArchive, FileImage, Filter, CheckCircle, AlertCircle } from 'lucide-react';

interface FoundFile {
  url: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  source_page: string;
  depth: number;
}

interface GrabberProgress {
  job_id: string;
  status: string;
  pages_crawled: number;
  files_found: number;
  files_downloaded: number;
  current_url: string | null;
  total_size: number;
}

interface GrabberResult {
  files: FoundFile[];
  pages_crawled: number;
  total_size: number;
  errors: string[];
}

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText, docx: FileText, xls: FileText, xlsx: FileText, ppt: FileText, pptx: FileText, txt: FileText, md: FileText,
  mp4: FileVideo, mkv: FileVideo, avi: FileVideo, webm: FileVideo, mov: FileVideo, flv: FileVideo, wmv: FileVideo,
  mp3: FileMusic, wav: FileMusic, flac: FileMusic, aac: FileMusic, ogg: FileMusic, m4a: FileMusic, opus: FileMusic,
  zip: FileArchive, rar: FileArchive, '7z': FileArchive, tar: FileArchive, gz: FileArchive, bz2: FileArchive, xz: FileArchive,
  jpg: FileImage, jpeg: FileImage, png: FileImage, gif: FileImage, svg: FileImage, webp: FileImage, bmp: FileImage,
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return 'Unknown';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function SiteGrabberPage() {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [sameDomain, setSameDomain] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<GrabberResult | null>(null);
  const [progress, setProgress] = useState<GrabberProgress | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [savePath] = useState('~/Downloads/SiteGrab');

  useEffect(() => {
    const unlisten = listen<GrabberProgress>('grabber-progress', (e) => {
      setProgress(e.payload);
    });
    return () => { unlisten.then(u => u()); };
  }, []);

  const allTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
    'mp4', 'mkv', 'avi', 'webm', 'mov', 'flv',
    'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus',
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
    'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setAnalyzing(true);
    setResult(null);
    setProgress(null);
    setSelectedFiles(new Set());
    try {
      const jobId = `grab_${Date.now()}`;
      const res = await invoke<GrabberResult>('analyze_site', {
        config: {
          start_url: url.trim(),
          max_depth: maxDepth,
          file_types: selectedTypes,
          min_size: null,
          max_size: null,
          url_pattern: null,
          same_domain: sameDomain,
          delay_ms: 100,
          max_files: 500,
        },
        jobId,
      });
      setResult(res);
    } catch (e: any) {
      alert('Analysis failed: ' + (e?.message || e));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = async () => {
    if (!result || selectedFiles.size === 0) return;
    setDownloading(true);
    const files = result.files.filter(f => selectedFiles.has(f.url));
    try {
      await invoke('download_grabbed_files', {
        files,
        savePath,
      });
      alert(`Started ${files.length} download(s)`);
    } catch (e: any) {
      alert('Download failed: ' + (e?.message || e));
    } finally {
      setDownloading(false);
    }
  };

  const filteredFiles = useMemo(() => {
    if (!result) return [];
    if (selectedTypes.length === 0) return result.files;
    return result.files.filter(f => selectedTypes.includes(f.file_type));
  }, [result, selectedTypes]);

  const toggleFile = (url: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedFiles(new Set(filteredFiles.map(f => f.url)));
  };

  const deselectAll = () => setSelectedFiles(new Set());

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 mb-1">
          <Globe className="w-5 h-5 text-indigo-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Site Grabber</h1>
        </div>
        <p className="text-xs text-zinc-500">Crawl a website and download all files matching your filters</p>
      </div>

      {/* Config */}
      <div className="px-6 py-4 border-b border-white/[0.04] space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/gallery"
              className="w-full bg-zinc-900/50 border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={!url.trim() || analyzing}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {analyzing ? 'Crawling...' : 'Analyze'}
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <label className="flex items-center gap-1.5">
            <span>Depth:</span>
            <input
              type="number"
              value={maxDepth}
              onChange={e => setMaxDepth(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
              min={0}
              max={10}
              className="w-14 bg-zinc-900/50 border border-white/[0.06] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-indigo-500/50"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={sameDomain}
              onChange={e => setSameDomain(e.target.checked)}
              className="rounded border-white/20 bg-zinc-900 text-indigo-500"
            />
            <span>Same domain only</span>
          </label>
        </div>

        {/* File type filter */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">File types</span>
            {selectedTypes.length > 0 && (
              <button onClick={() => setSelectedTypes([])} className="text-[10px] text-zinc-600 hover:text-zinc-400">
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {allTypes.map(type => (
              <button
                key={type}
                onClick={() => {
                  setSelectedTypes(prev =>
                    prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                  );
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase transition-colors ${
                  selectedTypes.includes(type)
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-zinc-900/50 text-zinc-500 border border-white/[0.04] hover:bg-white/[0.04]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {progress && (
          <div className="px-3 py-2 rounded-lg bg-zinc-900/50 border border-white/[0.04] text-xs text-zinc-400">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
              <span>Status: {progress.status}</span>
              <span className="text-zinc-600">·</span>
              <span>Pages: {progress.pages_crawled}</span>
              <span className="text-zinc-600">·</span>
              <span>Found: {progress.files_found}</span>
            </div>
            {progress.current_url && (
              <div className="truncate text-zinc-600">{progress.current_url}</div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!result && !analyzing && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <Globe className="w-12 h-12 mb-3 text-zinc-700" />
            <p className="text-sm">Enter a URL above to start crawling</p>
            <p className="text-xs text-zinc-700 mt-1">ZenDownload will scan the site and list all downloadable files</p>
          </div>
        )}

        {result && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-3">
                <span><CheckCircle className="w-3.5 h-3.5 text-emerald-400 inline mr-1" />{result.files.length} files found</span>
                <span>Pages: {result.pages_crawled}</span>
                <span>Total: {formatBytes(result.total_size)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={selectAllVisible} className="text-[11px] text-indigo-400 hover:text-indigo-300">Select all</button>
                <button onClick={deselectAll} className="text-[11px] text-zinc-500 hover:text-zinc-300">Deselect</button>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
                <div className="flex items-center gap-1.5 font-medium mb-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {result.errors.length} warning(s)
                </div>
                <div className="text-[10px] text-amber-500/70 truncate">{result.errors[0]}</div>
              </div>
            )}

            {filteredFiles.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">No files match your filters</div>
            ) : (
              <div className="space-y-1">
                {filteredFiles.map(file => {
                  const Icon = FILE_TYPE_ICONS[file.file_type] || FileText;
                  return (
                    <label
                      key={file.url}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedFiles.has(file.url)
                          ? 'bg-indigo-500/10 border border-indigo-500/20'
                          : 'bg-zinc-900/30 border border-white/[0.04] hover:bg-white/[0.04]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.url)}
                        onChange={() => toggleFile(file.url)}
                        className="rounded border-white/20 bg-zinc-900 text-indigo-500"
                      />
                      <Icon className="w-4 h-4 text-zinc-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-zinc-200 truncate">{file.file_name}</div>
                        <div className="text-[10px] text-zinc-600 truncate">{file.url}</div>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase shrink-0">{file.file_type}</span>
                      <span className="text-[11px] text-zinc-400 shrink-0 w-16 text-right">{formatBytes(file.file_size)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with download button */}
      {result && selectedFiles.size > 0 && (
        <div className="px-6 py-3 border-t border-white/[0.04] flex items-center justify-between bg-zinc-950">
          <div className="text-xs text-zinc-500">
            {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download Selected
          </button>
        </div>
      )}
    </div>
  );
}
