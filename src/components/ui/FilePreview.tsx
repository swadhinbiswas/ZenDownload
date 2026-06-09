import { useEffect, useState, useRef } from 'react';
import { X, FileText, Image as ImageIcon, Film, Music, Archive, FileCode, File as FileIcon, Loader2, ExternalLink, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';

export type FileType = 'video' | 'audio' | 'image' | 'text' | 'pdf' | 'archive' | 'code' | 'unknown';

export interface FilePreviewProps {
  filePath: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  onClose: () => void;
}

const VIDEO_EXT = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'm4v', 'wmv'];
const AUDIO_EXT = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
const TEXT_EXT = ['txt', 'md', 'log', 'csv', 'json', 'xml', 'yaml', 'yml', 'ini', 'conf', 'srt', 'vtt'];
const CODE_EXT = ['js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'css', 'html', 'sh', 'bash'];
const ARCHIVE_EXT = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz'];

function detectFileType(name: string, mime?: string): FileType {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (mime) {
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('text/')) return 'text';
  }
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXT.includes(ext)) return 'text';
  if (CODE_EXT.includes(ext)) return 'code';
  if (ARCHIVE_EXT.includes(ext)) return 'archive';
  return 'unknown';
}

function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function FilePreview({ filePath, fileName, fileSize, mimeType, onClose }: FilePreviewProps) {
  const [fileType, setFileType] = useState<FileType>('unknown');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const t = detectFileType(fileName, mimeType);
    setFileType(t);
    setError(null);
    setTextContent(null);
    setPreviewUrl(null);
    setLoading(true);

    if (t === 'video' || t === 'audio' || t === 'image') {
      invoke<string>('serve_file', { path: filePath })
        .then((dataUrl) => {
          setPreviewUrl(dataUrl);
          setLoading(false);
        })
        .catch((e) => {
          setError(String(e));
          setLoading(false);
        });
    } else if (t === 'text' || t === 'code') {
      invoke<string>('read_text_file', { path: filePath, maxBytes: 200_000 })
        .then((content) => {
          setTextContent(content);
          setLoading(false);
        })
        .catch((e) => {
          setError(String(e));
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [filePath, fileName, mimeType]);

  useEffect(() => {
    if (textRef.current && textContent) {
      textRef.current.scrollTop = 0;
    }
  }, [textContent]);

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-zinc-950 border-l border-white/5 z-50 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileTypeIcon type={fileType} className="w-4 h-4 text-zinc-400 shrink-0" />
          <h3 className="text-sm font-semibold text-zinc-200 truncate">{fileName}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => revealItemInDir(filePath).catch(() => {})}
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200"
            title="Show in folder"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => openPath(filePath).catch(() => {})}
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200"
            title="Open with default app"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="px-4 py-2 border-b border-white/5 flex items-center gap-3 text-[10px] text-zinc-500">
        <span>{fileType}</span>
        {fileSize !== undefined && <span>{formatBytes(fileSize)}</span>}
      </div>
      <div className="flex-1 overflow-auto bg-zinc-950">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-rose-400 text-sm">{error}</div>
        ) : fileType === 'video' && previewUrl ? (
          <video src={previewUrl} controls className="w-full h-full" />
        ) : fileType === 'audio' && previewUrl ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="w-full max-w-sm">
              <div className="aspect-square w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mb-6">
                <Music className="w-16 h-16 text-white" />
              </div>
              <h4 className="text-center text-sm text-zinc-200 font-medium mb-4">{fileName}</h4>
              <audio src={previewUrl} controls className="w-full" />
            </div>
          </div>
        ) : fileType === 'image' && previewUrl ? (
          <div className="flex items-center justify-center h-full p-4">
            <img src={previewUrl} alt={fileName} className="max-w-full max-h-full object-contain" />
          </div>
        ) : fileType === 'text' || fileType === 'code' ? (
          <div className="h-full">
            {textContent !== null ? (
              <pre ref={textRef} className="p-4 text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words h-full overflow-auto">
                {textContent}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">No content</div>
            )}
          </div>
        ) : fileType === 'pdf' && previewUrl ? (
          <iframe src={previewUrl} className="w-full h-full bg-white" title={fileName} />
        ) : fileType === 'archive' ? (
          <ArchivePreview filePath={filePath} fileName={fileName} />
        ) : (
          <UnsupportedPreview fileName={fileName} />
        )}
      </div>
    </div>
  );
}

function FileTypeIcon({ type, className }: { type: FileType; className?: string }) {
  switch (type) {
    case 'video': return <Film className={className} />;
    case 'audio': return <Music className={className} />;
    case 'image': return <ImageIcon className={className} />;
    case 'text': return <FileText className={className} />;
    case 'pdf': return <FileText className={className} />;
    case 'code': return <FileCode className={className} />;
    case 'archive': return <Archive className={className} />;
    default: return <FileIcon className={className} />;
  }
}

function ArchivePreview({ filePath, fileName: _fileName }: { filePath: string; fileName: string }) {
  const [entries, setEntries] = useState<{ name: string; size: number; is_dir: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    invoke<{ name: string; size: number; is_dir: boolean }[]>('list_archive', { path: filePath })
      .then(setEntries)
      .catch((e) => setError(String(e)));
  }, [filePath]);
  if (error) return <div className="p-4 text-rose-400 text-sm">{error}</div>;
  if (!entries) return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  return (
    <div className="p-4">
      <h4 className="text-xs text-zinc-500 uppercase mb-2">{entries.length} entries</h4>
      <div className="space-y-1">
        {entries.slice(0, 500).map((e, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-white/5">
            <span className="text-zinc-300 truncate">{e.is_dir ? '📁' : '📄'} {e.name}</span>
            {!e.is_dir && e.size > 0 && <span className="text-zinc-500 shrink-0">{formatBytes(e.size)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function UnsupportedPreview({ fileName }: { fileName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <FileIcon className="w-12 h-12 text-zinc-700 mb-3" />
      <p className="text-sm text-zinc-400">Preview not supported for this file type</p>
      <p className="text-[11px] text-zinc-600 mt-1">{fileName}</p>
      <button
        onClick={() => openPath(fileName).catch(() => {})}
        className="mt-4 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600"
      >
        Open Externally
      </button>
    </div>
  );
}
