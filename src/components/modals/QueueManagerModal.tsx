import { useState, useRef } from 'react';
import { useDownloadStore } from '@/stores/downloadStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GripVertical, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, X, FileVideo, FileMusic, FileArchive, FileText, File, Activity, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface QueueManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  Downloading: { icon: <Activity className="w-3.5 h-3.5" />, color: 'text-indigo-400' },
  Completed: { icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
  Error: { icon: <AlertCircle className="w-3.5 h-3.5" />, color: 'text-red-400' },
  Paused: { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-amber-400' },
  Pending: { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-zinc-500' },
};

function getFileIcon(category: string | null, filename?: string) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'webm'].includes(ext)) return <FileVideo className="w-4 h-4 text-purple-400" />;
  if (['mp3', 'wav', 'flac', 'm4a'].includes(ext)) return <FileMusic className="w-4 h-4 text-pink-400" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive className="w-4 h-4 text-amber-500" />;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText className="w-4 h-4 text-blue-400" />;
  if (category === 'Video') return <FileVideo className="w-4 h-4 text-purple-400" />;
  if (category === 'Music') return <FileMusic className="w-4 h-4 text-pink-400" />;
  return <File className="w-4 h-4 text-zinc-400" />;
}

export function QueueManagerModal({ isOpen, onClose }: QueueManagerModalProps) {
  const downloads = useDownloadStore((state) => state.downloads);
  const reorderDownloads = useDownloadStore((state) => state.reorderDownloads);
  const setDownloadPriority = useDownloadStore((state) => state.setDownloadPriority);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  // Active queue only — exclude completed
  const activeDownloads = downloads
    .filter(d => d.status !== 'Completed')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const completedCount = downloads.filter(d => d.status === 'Completed').length;

  const handleDragStart = (idx: number, e: React.DragEvent) => {
    setDraggedIdx(idx);
    dragNode.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDragEnd = () => {
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      const orderedIds = activeDownloads.map(d => d.id);
      const [moved] = orderedIds.splice(draggedIdx, 1);
      orderedIds.splice(dragOverIdx, 0, moved);
      reorderDownloads(orderedIds);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= activeDownloads.length) return;
    const orderedIds = activeDownloads.map(d => d.id);
    [orderedIds[idx], orderedIds[newIdx]] = [orderedIds[newIdx], orderedIds[idx]];
    reorderDownloads(orderedIds);
  };

  const moveToTop = (idx: number) => {
    if (idx === 0) return;
    const orderedIds = activeDownloads.map(d => d.id);
    const [moved] = orderedIds.splice(idx, 1);
    orderedIds.unshift(moved);
    reorderDownloads(orderedIds);
  };

  const moveToBottom = (idx: number) => {
    if (idx === activeDownloads.length - 1) return;
    const orderedIds = activeDownloads.map(d => d.id);
    const [moved] = orderedIds.splice(idx, 1);
    orderedIds.push(moved);
    reorderDownloads(orderedIds);
  };

  const bumpPriority = (id: string, currentPriority: number) => {
    setDownloadPriority(id, currentPriority + 10);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] md:max-w-[900px] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl">
        <div className="p-8 max-h-[85vh] flex flex-col">
          <DialogHeader className="mb-6 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 rounded-xl">
                <ChevronsUp className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">Queue Manager</DialogTitle>
                <p className="text-sm text-zinc-500 mt-0.5">Drag to reorder. Higher = downloads first. ({activeDownloads.length} active, {completedCount} completed)</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-md text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          {activeDownloads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-zinc-500">
              <ChevronsUp className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No active downloads in queue</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-2">
              {activeDownloads.map((d, idx) => {
                const statusInfo = STATUS_ICONS[d.status] || STATUS_ICONS.Pending;
                const isDragging = draggedIdx === idx;
                const isDragOver = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;
                return (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => handleDragStart(idx, e)}
                    onDragOver={(e) => handleDragOver(idx, e)}
                    onDragEnd={handleDragEnd}
                    onDrop={handleDragEnd}
                    className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                      isDragging ? 'opacity-50 border-indigo-500/30 bg-indigo-500/5' :
                      isDragOver ? 'border-indigo-500/50 bg-indigo-500/10' :
                      'border-white/[0.04] bg-zinc-900/30 hover:bg-zinc-800/30'
                    }`}
                  >
                    <GripVertical className="w-4 h-4 text-zinc-600 shrink-0" />

                    <div className="flex items-center justify-center w-7 h-7 rounded-md bg-zinc-800/50 text-xs font-mono text-zinc-500 shrink-0">
                      {idx + 1}
                    </div>

                    {getFileIcon(d.category, d.file_name)}

                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate font-medium">{d.file_name}</div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className={statusInfo.color}>{statusInfo.icon}</span>
                        <span className={statusInfo.color}>{d.status}</span>
                        <span className="text-zinc-700">·</span>
                        <span className="capitalize">{d.category || 'General'}</span>
                        {d.priority && d.priority > 0 && (
                          <>
                            <span className="text-zinc-700">·</span>
                            <span className="text-amber-400">P{d.priority}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveToTop(idx)}
                        className="h-7 w-7 text-zinc-500 hover:text-amber-300"
                        title="Move to top"
                      >
                        <ChevronsUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="h-7 w-7 text-zinc-500 hover:text-zinc-200"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === activeDownloads.length - 1}
                        className="h-7 w-7 text-zinc-500 hover:text-zinc-200"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveToBottom(idx)}
                        className="h-7 w-7 text-zinc-500 hover:text-amber-300"
                        title="Move to bottom"
                      >
                        <ChevronsDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => bumpPriority(d.id, d.priority || 0)}
                        className="h-7 w-7 text-zinc-500 hover:text-emerald-300"
                        title="Bump priority"
                      >
                        <ChevronsUp className="w-3.5 h-3.5 text-emerald-400" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg text-xs text-indigo-300">
            <strong>Tip:</strong> The download at the top of the list runs first. Drag rows to reorder, or use the arrow buttons. Click the green up-arrow to bump a download's priority so it jumps above lower-priority items.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
