import { Plus, Play, Pause, Square, Settings, Trash2, Globe, MonitorPlay, Headphones, PauseCircle, PlayCircle, Tv, Gauge } from 'lucide-react';
import { ListVideo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDownloadStore } from '../../stores/downloadStore';

interface ToolbarProps {
  onAddClick: () => void;
  onGrabberClick: () => void;
  onStreamClick: () => void;
  onMusicClick: () => void;
  onPlaylistClick: () => void;
  onSettingsClick: () => void;
  onPerformanceClick?: () => void;
  onM3uClick?: () => void;
}

export function Toolbar({ onAddClick, onGrabberClick, onStreamClick, onMusicClick, onPlaylistClick, onSettingsClick, onPerformanceClick, onM3uClick }: ToolbarProps) {
  const pauseSelected = useDownloadStore(s => s.pauseSelected);
  const resumeSelected = useDownloadStore(s => s.resumeSelected);
  const cancelSelected = useDownloadStore(s => s.cancelSelected);
  const deleteSelected = useDownloadStore(s => s.deleteSelected);
  const selectedIds = useDownloadStore(s => s.selectedIds);
  const downloads = useDownloadStore(s => s.downloads);
  const hasSelection = selectedIds.size > 0;
  const selectedDownloads = downloads.filter(d => selectedIds.has(d.id));
  const hasActiveSelection = selectedDownloads.some(d => d.status === 'Downloading');
  const hasPausedSelection = selectedDownloads.some(d => d.status === 'Paused' || d.status === 'Pending' || d.status === 'Error');

  const hasActiveDownloads = downloads.some(d => d.status === 'Downloading');
  const hasPausedDownloads = downloads.some(d => d.status === 'Paused' || d.status === 'Pending' || d.status === 'Error');

  const pauseAll = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    for (const d of downloads) {
      if (d.status === 'Downloading') {
        await invoke('pause_download', { id: d.id });
      }
    }
  };

  const resumeAll = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    for (const d of downloads) {
      if (d.status === 'Paused' || d.status === 'Pending' || d.status === 'Error') {
        await invoke('resume_download', { id: d.id });
      }
    }
  };

  return (
    <div className="h-12 flex items-center justify-between px-4 bg-zinc-950 border-b border-white/[0.06] relative z-20" data-tauri-drag-region>
      <div className="flex items-center gap-1.5">
        <Button 
          variant="ghost" 
          className="flex items-center gap-2 h-8 px-3.5 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-600/20"
          onClick={onAddClick}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </Button>
        
        <div className="w-px h-5 bg-white/[0.08] mx-1" />
        
        <div className="flex items-center bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
          <Button 
            variant="ghost" 
            className={`flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md transition-all ${
              hasSelection && hasPausedSelection 
              ? 'text-emerald-400 hover:bg-emerald-500/10' 
              : 'text-zinc-600 cursor-not-allowed'
            }`}
            onClick={hasSelection && hasPausedSelection ? resumeSelected : undefined}
            disabled={!hasSelection || !hasPausedSelection}
          >
            <Play className="w-3 h-3" />
            <span>Resume</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md transition-all ${
              hasSelection && hasActiveSelection 
              ? 'text-amber-400 hover:bg-amber-500/10' 
              : 'text-zinc-600 cursor-not-allowed'
            }`}
            onClick={hasSelection && hasActiveSelection ? pauseSelected : undefined}
            disabled={!hasSelection || !hasActiveSelection}
          >
            <Pause className="w-3 h-3" />
            <span>Pause</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md transition-all ${
              hasSelection 
              ? 'text-zinc-300 hover:bg-white/[0.06]' 
              : 'text-zinc-600 cursor-not-allowed'
            }`}
            onClick={hasSelection ? cancelSelected : undefined}
            disabled={!hasSelection}
          >
            <Square className="w-3 h-3" />
            <span>Stop</span>
          </Button>
        </div>

        <Button 
          variant="ghost" 
          className={`flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-lg transition-all ${
            hasSelection 
              ? 'text-red-400 hover:bg-red-500/10' 
              : 'text-zinc-600 cursor-not-allowed'
          }`}
          onClick={hasSelection ? deleteSelected : undefined}
          disabled={!hasSelection}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </Button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        <Button 
          variant="ghost" 
          className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded-lg transition-all"
          onClick={onGrabberClick}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Grabber</span>
        </Button>
        <Button
          variant="ghost"
          className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded-lg transition-all"
          onClick={onStreamClick}
        >
          <MonitorPlay className="w-3.5 h-3.5" />
          <span>Stream</span>
        </Button>
        <Button
          variant="ghost"
          className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-zinc-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg transition-all"
          onClick={onMusicClick}
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>Music</span>
        </Button>
        <Button
          variant="ghost"
          className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-all"
          onClick={onPlaylistClick}
        >
          <ListVideo className="w-3.5 h-3.5" />
          <span>Playlist</span>
        </Button>
        {onM3uClick && (
          <Button
            variant="ghost"
            className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-zinc-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg transition-all"
            onClick={onM3uClick}
            title="M3U / IPTV Importer"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>IPTV</span>
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
          <Button 
            variant="ghost" 
            className={`flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md transition-all ${
              hasPausedDownloads 
              ? 'text-emerald-400 hover:bg-emerald-500/10' 
              : 'text-zinc-600 cursor-not-allowed'
            }`}
            onClick={hasPausedDownloads ? resumeAll : undefined}
            disabled={!hasPausedDownloads}
            title="Resume All"
          >
            <PlayCircle className="w-3.5 h-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            className={`flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md transition-all ${
              hasActiveDownloads 
              ? 'text-amber-400 hover:bg-amber-500/10' 
              : 'text-zinc-600 cursor-not-allowed'
            }`}
            onClick={hasActiveDownloads ? pauseAll : undefined}
            disabled={!hasActiveDownloads}
            title="Pause All"
          >
            <PauseCircle className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.06] bg-white/[0.03]">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <span className="text-[10px] font-semibold text-zinc-500 tracking-wider">ONLINE</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-500 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg h-8 w-8"
          onClick={onPerformanceClick}
          title="Performance Dashboard"
        >
          <Gauge className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] rounded-lg h-8 w-8"
          onClick={onSettingsClick}
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
