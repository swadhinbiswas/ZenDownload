import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link2, X, Download, ExternalLink, ChevronRight, FileText, FileVideo, FileMusic, FileArchive, FileImage } from 'lucide-react';

interface PageLink {
  url: string;
  text: string;
  is_file: boolean;
  file_type: string | null;
  file_size: number | null;
}

interface LinkPanelProps {
  open: boolean;
  onClose: () => void;
  pageUrl: string;
  links: PageLink[];
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
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function LinkPanel({ open, onClose, pageUrl, links }: LinkPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'files' | 'pages'>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const files = useMemo(() => links.filter(l => l.is_file), [links]);
  const pages = useMemo(() => links.filter(l => !l.is_file), [links]);

  const filtered = useMemo(() => {
    let list = filter === 'files' ? files : filter === 'pages' ? pages : links;
    if (typeFilter) {
      list = list.filter(l => l.file_type === typeFilter);
    }
    return list;
  }, [links, filter, typeFilter, files, pages]);

  const fileTypes = useMemo(() => {
    const types = new Set<string>();
    files.forEach(f => f.file_type && types.add(f.file_type));
    return Array.from(types).sort();
  }, [files]);

  const toggle = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAllFiles = () => setSelected(new Set(files.map(f => f.url)));
  const deselectAll = () => setSelected(new Set());

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    const filesToDownload = files.filter(f => selected.has(f.url));
    let count = 0;
    for (const file of filesToDownload) {
      try {
        await invoke('add_download', {
          url: file.url,
          savePath: null,
          threads: 4,
          category: null,
          extraMeta: null,
        });
        count++;
      } catch (e) {
        console.error('Failed to add download:', e);
      }
    }
    setDownloading(false);
    alert(`Added ${count} download(s) to queue`);
    setSelected(new Set());
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[480px] max-w-full bg-zinc-950 border-l border-white/[0.06] z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.04]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Page Links</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 truncate">{pageUrl}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500">
            <span>{links.length} total</span>
            <span className="text-zinc-700">·</span>
            <span className="text-emerald-400">{files.length} files</span>
            <span className="text-zinc-700">·</span>
            <span className="text-indigo-400">{pages.length} pages</span>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-white/[0.04] space-y-2">
          <div className="flex items-center gap-1">
            {(['all', 'files', 'pages'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  filter === f
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-zinc-900/50 text-zinc-500 border border-white/[0.04] hover:bg-white/[0.04]'
                }`}
              >
                {f === 'all' ? 'All' : f === 'files' ? 'Files' : 'Pages'}
              </button>
            ))}
            {typeFilter && (
              <button onClick={() => setTypeFilter(null)} className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300">
                Clear type filter
              </button>
            )}
          </div>
          {fileTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {fileTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                    typeFilter === type
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-zinc-900/50 text-zinc-600 hover:bg-white/[0.04]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <Link2 className="w-10 h-10 mb-2 text-zinc-700" />
              <p className="text-xs">No links found</p>
            </div>
          ) : (
            <div className="p-3 space-y-0.5">
              {filtered.map(link => {
                const Icon = link.file_type ? FILE_TYPE_ICONS[link.file_type] || FileText : ChevronRight;
                const isFile = link.is_file;
                return (
                  <label
                    key={link.url}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                      selected.has(link.url)
                        ? 'bg-indigo-500/10'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {isFile ? (
                      <input
                        type="checkbox"
                        checked={selected.has(link.url)}
                        onChange={() => toggle(link.url)}
                        className="rounded border-white/20 bg-zinc-900 text-indigo-500"
                      />
                    ) : (
                      <div className="w-3.5 shrink-0" />
                    )}
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isFile ? 'text-zinc-500' : 'text-indigo-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] truncate ${isFile ? 'text-zinc-200' : 'text-zinc-300'}`}>
                        {link.text || link.url}
                      </div>
                      {!isFile && link.text && (
                        <div className="text-[10px] text-zinc-600 truncate">{link.url}</div>
                      )}
                    </div>
                    {isFile && link.file_type && (
                      <span className="text-[9px] font-mono text-zinc-500 uppercase shrink-0">{link.file_type}</span>
                    )}
                    {isFile && link.file_size && (
                      <span className="text-[10px] text-zinc-500 shrink-0">{formatBytes(link.file_size)}</span>
                    )}
                    {!isFile && (
                      <ExternalLink className="w-3 h-3 text-zinc-700 shrink-0" />
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {files.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span>{selected.size} selected</span>
              <button onClick={selectAllFiles} className="text-indigo-400 hover:text-indigo-300">All files</button>
              <button onClick={deselectAll} className="text-zinc-500 hover:text-zinc-300">None</button>
            </div>
            <button
              onClick={downloadSelected}
              disabled={selected.size === 0 || downloading}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
