import { useEffect, useState, useCallback } from 'react';
import { Upload } from 'lucide-react';

interface DragDropZoneProps {
  onUrlDropped: (url: string) => void;
  children: React.ReactNode;
}

export function DragDropZone({ onUrlDropped, children }: DragDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the window (not entering a child)
    if (e.relatedTarget === null || !(e.relatedTarget as HTMLElement)?.ownerDocument) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Check for URLs in text data
    const text = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('text/uri-list') || '';
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      onUrlDropped(urlMatch[0]);
      return;
    }

    // Check for files (torrent files, etc.)
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.torrent')) {
        // For torrent files, we need the file path — use Tauri's file drop
        // The file.name alone isn't enough, but for now log it
        console.log('Torrent file dropped:', file.name);
      }
    }
  }, [onUrlDropped]);

  useEffect(() => {
    const el = document.documentElement;
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);

    return () => {
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('drop', handleDrop);
    };
  }, [handleDragOver, handleDragLeave, handleDrop]);

  return (
    <>
      {children}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4 p-12 rounded-2xl border-2 border-dashed border-indigo-500/50 bg-indigo-500/[0.05]">
            <Upload className="w-16 h-16 text-indigo-400 animate-bounce" />
            <div className="text-center">
              <p className="text-xl font-bold text-white">Drop URL to download</p>
              <p className="text-sm text-zinc-400 mt-1">Link, magnet, or .torrent file</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
