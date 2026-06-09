import { useDownloadStore, Download } from '../../stores/downloadStore';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { DownloadPropertiesModal } from '../modals/DownloadPropertiesModal';
import { TorrentPeerMap } from './TorrentPeerMap';
import { Sparkline } from '../ui/Sparkline';
import { FilePreview } from '../ui/FilePreview';
import { Settings, Play, Pause, Trash2, Copy, FolderOpen, X, FileVideo, FileMusic, FileArchive, FileText, Blocks, File, Activity, CheckCircle, AlertCircle, Clock, Zap, ExternalLink, FolderUp, RefreshCw, Eye, ArrowUp, Users, TrendingUp, CheckSquare, Square } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Checkbox } from '@/components/ui/checkbox';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';

export function DownloadList() {
    const downloads = useDownloadStore((state) => state.downloads);
    const filterCategory = useDownloadStore((state) => state.filterCategory);
    const toggleSelection = useDownloadStore((state) => state.toggleSelection);
    const selectedIds = useDownloadStore((state) => state.selectedIds);
    const clearSelection = useDownloadStore((state) => state.clearSelection);
    const pauseSelected = useDownloadStore((state) => state.pauseSelected);
    const resumeSelected = useDownloadStore((state) => state.resumeSelected);
    const cancelSelected = useDownloadStore((state) => state.cancelSelected);
    const deleteSelected = useDownloadStore((state) => state.deleteSelected);
    const deleteDownload = useDownloadStore((state) => state.deleteDownload);
    const [propertiesDownload, setPropertiesDownload] = useState<Download | null>(null);
    const [previewDownload, setPreviewDownload] = useState<Download | null>(null);

    const torrentStats = useDownloadStore((state) => state.torrentStats);
    const speedHistory = useDownloadStore((state) => state.speedHistory);
    const fetchDownloads = useDownloadStore((state) => state.fetchDownloads);

    const filteredDownloads = downloads.filter((d) => 
        filterCategory === null ? true : 
        (['Downloading', 'Completed', 'Error'].includes(filterCategory)) ? d.status === filterCategory :
        d.category === filterCategory
    );

    // Select all items currently visible (respecting the active filter)
    const selectAllVisible = () => {
        const { toggleSelection } = useDownloadStore.getState();
        const visible = filteredDownloads.map(d => d.id);
        const alreadySelected = visible.every(id => selectedIds.has(id));
        if (alreadySelected) {
            // Deselect all visible items
            for (const id of visible) {
                if (selectedIds.has(id)) toggleSelection(id);
            }
        } else {
            for (const id of visible) {
                if (!selectedIds.has(id)) toggleSelection(id);
            }
        }
    };

    const allVisibleSelected = filteredDownloads.length > 0 && filteredDownloads.every(d => selectedIds.has(d.id));
    const someVisibleSelected = filteredDownloads.some(d => selectedIds.has(d.id)) && !allVisibleSelected;
    const selectionCount = selectedIds.size;

    const confirmAndDeleteSelected = async () => {
        if (selectionCount === 0) return;
        const ok = window.confirm(
            `Remove ${selectionCount} download${selectionCount === 1 ? '' : 's'} from the list?\n\n` +
            `(The downloaded files on disk will NOT be deleted. To also delete the file, use Properties → Open in Folder and remove it manually.)`
        );
        if (!ok) return;
        await deleteSelected();
    };

    const getFileIcon = (category: string | null, filename?: string) => {
        const ext = filename?.split('.').pop()?.toLowerCase() || '';

        // Priority 1: Check actual file extension
        if (['mp4', 'mkv', 'avi', 'webm', 'flv', 'mov', 'ts'].includes(ext)) {
            return <FileVideo className="w-5 h-5 text-purple-400" />;
        }
        if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus'].includes(ext)) {
            return <FileMusic className="w-5 h-5 text-pink-400" />;
        }
        if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
            return <FileArchive className="w-5 h-5 text-amber-500" />;
        }
        if (['exe', 'msi', 'apk', 'dmg', 'iso', 'appimage'].includes(ext)) {
            return <Blocks className="w-5 h-5 text-emerald-500" />;
        }
        if (['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
            return <FileText className="w-5 h-5 text-blue-400" />;
        }

        // Priority 2: Fallback to general category assigned to download
        switch(category) {
            case 'Video': return <FileVideo className="w-5 h-5 text-purple-400" />;
            case 'Music': return <FileMusic className="w-5 h-5 text-pink-400" />;
            case 'Compressed': return <FileArchive className="w-5 h-5 text-amber-500" />;
            case 'Documents': return <FileText className="w-5 h-5 text-blue-400" />;
            case 'Programs': return <Blocks className="w-5 h-5 text-emerald-500" />;
            default: return <File className="w-5 h-5 text-zinc-400" />;
        }
    };

    const getCategoryBadge = (category: string | null) => {
        switch(category) {
            case 'Music': return <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-500/10 text-pink-400 border border-pink-500/20">MUSIC</span>;
            case 'Video': return <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">VIDEO</span>;
            case 'Compressed': return <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">ZIP</span>;
            case 'Documents': return <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">DOC</span>;
            case 'Programs': return <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">APP</span>;
            default: return null;
        }
    };

    const cleanMusicTitle = (filename?: string, category?: string | null) => {
        if (!filename || category !== 'Music') return filename;
        // Remove file extension
        let clean = filename.replace(/\.[^/.]+$/, '');
        // Replace full-width characters used by yt-dlp
        clean = clean.replace(/｜/g, '|').replace(/：/g, ':').replace(/＂/g, '"').replace(/＇/g, "'");
        // Clean up common suffixes
        clean = clean.replace(/\s*\|\s*Official\s*(Video|Audio|Music Video)\s*$/i, '');
        clean = clean.replace(/\s*\|\s*Lyrics?\s*$/i, '');
        clean = clean.replace(/\s*\|\s*Cover\s*$/i, '');
        clean = clean.replace(/\s*\|\s*Visualizer\s*$/i, '');
        clean = clean.replace(/\s*-\s*Official\s*(Video|Audio|Music Video)\s*$/i, '');
        clean = clean.replace(/\s*\(Official\s*(Video|Audio|Music Video)\)\s*$/i, '');
        clean = clean.replace(/\s*\[Official\s*(Video|Audio|Music Video)\]\s*$/i, '');
        clean = clean.trim();
        return clean || filename;
    };

    const getStatusIcon = (status: string) => {
        switch(status) {
            case 'Downloading': return <Zap className="w-4 h-4 text-green-400 animate-pulse" />;
            case 'Completed': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
            case 'Paused': return <Clock className="w-4 h-4 text-yellow-500" />;
            case 'Error': return <AlertCircle className="w-4 h-4 text-red-500" />;
            default: return <Clock className="w-4 h-4 text-zinc-400" />;
        }
    };

    function formatBytes(bytes: number | null | undefined, decimals = 2) {
        if (bytes == null || !isFinite(bytes) || bytes <= 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[Math.min(i, sizes.length - 1)]}`;
    }

    function formatEta(seconds: number): string {
        if (!isFinite(seconds) || seconds < 0) return '∞';
        if (seconds < 1) return '<1s';
        if (seconds < 60) return `${Math.floor(seconds)}s`;
        if (seconds < 3600) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}m ${s}s`;
        }
        if (seconds < 86400) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            return `${h}h ${m}m`;
        }
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        return `${d}d ${h}h`;
    }

    const getFullPath = (download: Download) => {
        const savePath = download.save_path.replace(/\/+$/, '');
        const fileName = download.file_name;
        if (!fileName) return savePath;
        // Get the last path component of save_path
        const lastSlash = savePath.lastIndexOf('/');
        const lastComponent = lastSlash >= 0 ? savePath.slice(lastSlash + 1) : savePath;
        // If the last component matches file_name, save_path is the full file path
        if (lastComponent === fileName) return savePath;
        // Otherwise, save_path is a directory — join with file_name
        return `${savePath}/${fileName}`;
    };

    const handleOpenFile = async (download: Download) => {
        const fullPath = getFullPath(download);
        try {
            await openPath(fullPath);
        } catch (e: any) {
            console.error('Failed to open file:', e);
            try {
                await revealItemInDir(fullPath);
            } catch (e2: any) {
                alert(`Could not open file.\nPath: ${fullPath}\nError: ${e2?.message || String(e2)}`);
            }
        }
    };

    return (
        <div className="flex-1 overflow-auto z-10 relative">
            <div className="max-w-5xl mx-auto">
                {/* Sticky bulk-action toolbar (only visible when 1+ items are marked) */}
                {selectionCount > 0 && (
                    <div className="sticky top-0 z-20 -mx-3 sm:mx-0 mb-2 px-3 sm:px-5 py-2 bg-zinc-900/80 border border-indigo-500/30 rounded-none backdrop-blur-md flex items-center gap-2.5 flex-wrap shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_4px_20px_-4px_rgba(99,102,241,0.25)]">
                        {/* Accent gradient bar on the left edge (cute highlight) */}
                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-indigo-400 via-violet-400 to-fuchsia-400 pointer-events-none" aria-hidden />

                        <div className="flex items-center gap-2 shrink-0">
                            <Checkbox
                                checked={allVisibleSelected}
                                indeterminate={someVisibleSelected}
                                onCheckedChange={selectAllVisible}
                                aria-label="Select all visible"
                                className="border-indigo-400 data-[state=checked]:bg-indigo-500 data-[state=checked]:text-white data-[state=indeterminate]:bg-indigo-500/40"
                            />
                            <span className="relative inline-flex items-baseline tabular-nums whitespace-nowrap">
                                <span className="text-[12px] font-bold text-indigo-100 [text-shadow:0_0_12px_rgba(99,102,241,0.45)]">
                                    {selectionCount}
                                </span>
                                <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-300/80">
                                    selected
                                </span>
                                {selectionCount !== filteredDownloads.length && filteredDownloads.length > 0 && (
                                    <span className="ml-1.5 text-[11px] text-zinc-500 font-normal">
                                        of {filteredDownloads.length}
                                    </span>
                                )}
                                {/* Cute animated underline */}
                                <span className="absolute -bottom-0.5 left-0 h-px w-full bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent animate-pulse pointer-events-none" aria-hidden />
                            </span>
                        </div>

                        <div className="h-4 w-px bg-white/10 shrink-0" aria-hidden />

                        <div className="flex items-center gap-1 flex-wrap">
                            <button
                                type="button"
                                onClick={() => resumeSelected()}
                                disabled={selectionCount === 0}
                                className="h-6 px-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:bg-emerald-500/20"
                                title="Resume selected"
                            >
                                <Play className="w-3 h-3 fill-current" /> Resume
                            </button>
                            <button
                                type="button"
                                onClick={() => pauseSelected()}
                                disabled={selectionCount === 0}
                                className="h-6 px-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:bg-amber-500/20"
                                title="Pause selected"
                            >
                                <Pause className="w-3 h-3 fill-current" /> Pause
                            </button>
                            <button
                                type="button"
                                onClick={() => cancelSelected()}
                                disabled={selectionCount === 0}
                                className="h-6 px-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:bg-white/[0.08]"
                                title="Cancel selected (in-progress downloads)"
                            >
                                <X className="w-3 h-3" /> Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmAndDeleteSelected}
                                disabled={selectionCount === 0}
                                className="h-6 px-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:bg-red-500/20"
                                title="Remove selected from the list"
                            >
                                <Trash2 className="w-3 h-3" /> Delete
                            </button>
                        </div>

                        <div className="ml-auto flex items-center gap-0.5 shrink-0">
                            <button
                                type="button"
                                onClick={selectAllVisible}
                                className="h-6 px-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:bg-white/[0.06]"
                                title="Select / deselect all visible items"
                            >
                                {allVisibleSelected ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
                                {allVisibleSelected ? 'Deselect all' : 'Select all'}
                            </button>
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="h-6 w-6 inline-flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:bg-white/[0.06]"
                                title="Clear selection"
                                aria-label="Clear selection"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {filteredDownloads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-zinc-500">
                        <div className="w-16 h-16 mb-5 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                            <Activity className="w-7 h-7 text-zinc-700" />
                        </div>
                        <p className="text-lg font-semibold text-zinc-400 tracking-tight">No downloads yet</p>
                        <p className="text-sm mt-1.5 text-zinc-600">Paste a URL or click Add to get started</p>
                    </div>
                ) : filteredDownloads.map((download) => {
                    const isSelected = selectedIds.has(download.id);
                    const progressPercentage = download.total_size && download.total_size > 0 && download.downloaded
                        ? Math.min((download.downloaded / download.total_size) * 100, 100)
                        : download.status === 'Completed' ? 100 : 0;
                    
                    return (
                        <ContextMenu key={download.id}>
                            <ContextMenuTrigger>
                                <div 
                                    className={`group flex items-center gap-3 pl-3 pr-5 py-3 border-b border-white/[0.04] transition-all duration-150 cursor-pointer ${
                                        isSelected 
                                            ? 'bg-indigo-500/[0.06]' 
                                            : 'hover:bg-white/[0.02]'
                                    }`}
                                    onClick={() => toggleSelection(download.id)}
                                    onDoubleClick={() => {
                                        if (download.status === 'Completed') {
                                            handleOpenFile(download);
                                        } else {
                                            setPropertiesDownload(download);
                                        }
                                    }}
                                >
                                    {/* Per-row selection checkbox (always visible) */}
                                    <div
                                        className="shrink-0 flex items-center justify-center w-7 h-7 -ml-1.5 cursor-pointer select-none"
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        onContextMenu={(e) => e.stopPropagation()}
                                        title={isSelected ? 'Unmark' : 'Mark for batch actions'}
                                    >
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => toggleSelection(download.id)}
                                            aria-label={`Select ${download.file_name || download.url}`}
                                            className={isSelected
                                                ? "border-indigo-500 data-[state=checked]:bg-indigo-500 data-[state=checked]:text-white"
                                                : "border-zinc-700 bg-zinc-950/70 hover:border-indigo-400"}
                                        />
                                    </div>

                                    {/* Thumbnail / File icon */}
                                    {download.thumbnail ? (
                                        <img
                                            src={download.thumbnail.startsWith('http') || download.thumbnail.startsWith('data:') ? download.thumbnail : convertFileSrc(download.thumbnail)}
                                            alt=""
                                            className="shrink-0 w-[72px] h-[54px] rounded-lg object-cover bg-zinc-800"
                                            onError={(e) => {
                                                const img = e.target as HTMLImageElement;
                                                img.style.display = 'none';
                                                (img.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                                            }}
                                        />
                                    ) : null}
                                    <div className={`shrink-0 w-[72px] h-[54px] rounded-lg flex items-center justify-center ${
                                        download.thumbnail ? 'hidden' :
                                        download.category === 'Video' ? 'bg-purple-500/10 text-purple-400' :
                                        download.category === 'Music' ? 'bg-pink-500/10 text-pink-400' :
                                        download.category === 'Compressed' ? 'bg-amber-500/10 text-amber-400' :
                                        download.category === 'Documents' ? 'bg-blue-500/10 text-blue-400' :
                                        download.category === 'Programs' ? 'bg-emerald-500/10 text-emerald-400' :
                                        'bg-zinc-700/30 text-zinc-500'
                                    }`}>
                                        {getFileIcon(download.category, download.file_name || '')}
                                    </div>

                                    {/* Name + URL */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className={`text-[13px] font-medium truncate ${
                                                download.category === 'Music' ? 'text-pink-200' : 'text-zinc-200'
                                            }`}>{download.title || cleanMusicTitle(download.file_name, download.category) || 'Untitled'}</h3>
                                            {getCategoryBadge(download.category)}
                                            {download.resolution && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">{download.resolution}</span>
                                            )}
                                            <div className={`shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                                download.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                                download.status === 'Downloading' ? 'bg-blue-500/10 text-blue-400' :
                                                download.status === 'Paused' ? 'bg-amber-500/10 text-amber-400' :
                                                download.status === 'Error' ? 'bg-red-500/10 text-red-400' :
                                                download.status === 'Needs Refresh' ? 'bg-amber-500/10 text-amber-400' :
                                                'bg-zinc-700/30 text-zinc-500'
                                            }`}>
                                                {getStatusIcon(download.status)}
                                                {download.status}
                                            </div>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                                                        download.status === 'Completed' ? 'bg-emerald-500' :
                                                        download.status === 'Error' ? 'bg-red-500' :
                                                        download.status === 'Paused' ? 'bg-amber-500' :
                                                        'bg-indigo-500'
                                                    }`}
                                                    style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-[11px] font-mono font-medium text-zinc-500 tabular-nums shrink-0 w-10 text-right">
                                                {progressPercentage > 0 && progressPercentage < 100 ? `${Math.round(progressPercentage)}%` : progressPercentage >= 100 ? '100%' : ''}
                                            </span>
                                        </div>
                                    </div>

                    {/* Meta info */}
                    <div className="shrink-0 flex items-center gap-4 text-[11px] text-zinc-500">
                        {/* Speed indicator */}
                        {download.status === 'Downloading' && download.currentSpeed && download.currentSpeed > 0 && (
                            <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
                                <Sparkline data={speedHistory.get(download.id) || []} width={60} height={16} color="#06b6d4" />
                                {formatBytes(download.currentSpeed)}/s
                            </span>
                        )}
                        
                        {/* Average speed for completed downloads (like IDM) */}
                        {download.status === 'Completed' && download.avgSpeed && download.avgSpeed > 0 && (
                            <span className="flex items-center gap-1 text-emerald-400 font-medium" title="Average download speed">
                                <TrendingUp className="w-3 h-3" />
                                {formatBytes(download.avgSpeed)}/s
                            </span>
                        )}
                        
                        {/* Torrent upload speed */}
                        {download.download_type === 'torrent' && (() => {
                            const ts = torrentStats.get(download.id);
                            return ts && ts.up_speed > 0 ? (
                                <span className="flex items-center gap-1 text-emerald-400/80 font-medium" title="Upload speed">
                                    <ArrowUp className="w-3 h-3" />
                                    {formatBytes(ts.up_speed)}/s
                                </span>
                            ) : null;
                        })()}
                        
                        {/* Torrent peers */}
                        {download.download_type === 'torrent' && (() => {
                            const ts = torrentStats.get(download.id);
                            return ts && ts.total_peers > 0 ? (
                                <span className="flex items-center gap-1 text-violet-400/80" title={`${ts.active_peers} active / ${ts.total_peers} seen peers`}>
                                    <Users className="w-3 h-3" />
                                    <span className="font-mono">{ts.active_peers}/{ts.total_peers}</span>
                                </span>
                            ) : null;
                        })()}
                        
                        {/* ETA for downloading */}
                        {download.status === 'Downloading' && download.currentSpeed && download.currentSpeed > 0 && download.total_size && download.total_size > 0 && (() => {
                            const remaining = (download.total_size || 0) - (download.downloaded || 0);
                            if (remaining <= 0) return null;
                            const secs = remaining / (download.currentSpeed || 1);
                            if (!isFinite(secs) || secs < 0) return null;
                            return (
                                <span className="font-mono text-amber-400/80" title="Estimated time remaining">
                                    ETA {formatEta(secs)}
                                </span>
                            );
                        })()}
                        
                        {/* Time elapsed for completed */}
                        {download.status === 'Completed' && download.completed_at && (() => {
                            const d = new Date(download.completed_at);
                            if (isNaN(d.getTime())) return null;
                            return (
                                <span className="font-mono text-zinc-500" title="Completed at">
                                    {formatDistanceToNow(d, { addSuffix: true })}
                                </span>
                            );
                        })()}
                        
                        {/* Size info - always show */}
                        <span className="font-mono tabular-nums">
                            {download.total_size && download.total_size > 0 
                                ? `${formatBytes(download.downloaded)}/${formatBytes(download.total_size)}` 
                                : download.downloaded > 0 
                                    ? formatBytes(download.downloaded)
                                    : '0 B'}
                        </span>
                        
                        {/* Created time */}
                        <span className="text-zinc-600">
                            {download.created_at && !isNaN(new Date(download.created_at).getTime()) 
                                ? formatDistanceToNow(new Date(download.created_at), { addSuffix: true }) 
                                : ''}
                        </span>
                    </div>

                                    {/* Open button for completed downloads */}
                                    {download.status === 'Completed' && (
                                        <button
                                            className={`shrink-0 p-1.5 rounded-md transition-all duration-150 ${
                                                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                            } hover:bg-blue-500/10`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenFile(download);
                                            }}
                                            title="Open file"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-zinc-600 hover:text-blue-400" />
                                        </button>
                                    )}

                                    {/* Delete button */}
                                    <button 
                                        className={`shrink-0 p-1.5 rounded-md transition-all duration-150 ${
                                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        } hover:bg-red-500/10`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteDownload(download.id);
                                        }}
                                    >
                                        <X className="w-3.5 h-3.5 text-zinc-600 hover:text-red-400" />
                                    </button>
                                </div>
                                {download.download_type === 'torrent' && (
                                    <div className="px-5 pb-3">
                                        <TorrentPeerMap stats={torrentStats.get(download.id)} />
                                    </div>
                                )}
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-56 bg-zinc-900/95 backdrop-blur-xl border-white/[0.08] rounded-lg p-1 shadow-2xl">
                                {(download.status === 'Paused' || download.status === 'Error' || download.status === 'Pending') && (
                                    <ContextMenuItem 
                                        className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-emerald-400 hover:bg-emerald-500/10"
                                        onClick={() => {
                                            toggleSelection(download.id);
                                            resumeSelected();
                                        }}
                                    >
                                        <Play className="w-4 h-4" />
                                        <span>Resume</span>
                                    </ContextMenuItem>
                                )}
                                {download.status === 'Downloading' && (
                                    <ContextMenuItem 
                                        className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-amber-400 hover:bg-amber-500/10"
                                        onClick={() => {
                                            toggleSelection(download.id);
                                            pauseSelected();
                                        }}
                                    >
                                        <Pause className="w-4 h-4" />
                                        <span>Pause</span>
                                    </ContextMenuItem>
                                )}
                                <ContextMenuSeparator className="my-1 bg-white/[0.06]" />
                                <ContextMenuItem
                                    className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                                    onClick={() => setPropertiesDownload(download)}
                                >
                                    <Settings className="w-4 h-4" />
                                    <span>Properties</span>
                                </ContextMenuItem>
                                {download.status === 'Completed' && download.save_path && (
                                    <ContextMenuItem
                                        className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                                        onClick={() => setPreviewDownload(download)}
                                    >
                                        <Eye className="w-4 h-4" />
                                        <span>Preview</span>
                                    </ContextMenuItem>
                                )}
                                <ContextMenuItem
                                    className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                                    onClick={async () => {
                                        const input = prompt('Speed limit in KB/s (0 = unlimited):', '0');
                                        if (input !== null) {
                                            const kb = parseInt(input, 10);
                                            if (!isNaN(kb) && kb >= 0) {
                                                await invoke('set_download_speed_limit', { id: download.id, limitKb: kb });
                                                await fetchDownloads();
                                            }
                                        }
                                    }}
                                >
                                    <Zap className="w-4 h-4" />
                                    <span>Speed Limit</span>
                                </ContextMenuItem>
                                {download.status === 'Completed' && download.save_path && (
                                    <>
                                        <ContextMenuSeparator className="my-1 bg-white/[0.06]" />
                                        <ContextMenuItem
                                            className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-blue-400 hover:bg-blue-500/10"
                                            onClick={() => handleOpenFile(download)}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            <span>Open File</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                                            onClick={async () => {
                                                try {
                                                    await revealItemInDir(getFullPath(download));
                                                } catch (e: any) {
                                                    alert(`Could not open folder.\nPath: ${getFullPath(download)}\nError: ${e?.message || String(e)}`);
                                                }
                                            }}
                                        >
                                            <FolderUp className="w-4 h-4" />
                                            <span>Open in Folder</span>
                                        </ContextMenuItem>
                                    </>
                                )}
                                <ContextMenuSeparator className="my-1 bg-white/[0.06]" />
                                {download.status === 'Completed' && (
                                    <ContextMenuItem
                                        className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                                        onClick={async () => {
                                            const presets = await invoke<{id: string; name: string}[]>('get_compatible_presets', { filePath: getFullPath(download) });
                                            if (presets.length > 0) {
                                                const presetId = prompt(`Convert to:\n${presets.map((p, i) => `${i + 1}. ${p.name} (→ .${p.id.split('_').pop()})`).join('\n')}\nEnter number:`);
                                                if (presetId) {
                                                    const idx = parseInt(presetId) - 1;
                                                    if (idx >= 0 && idx < presets.length) {
                                                        await invoke('convert_file', {
                                                            inputPath: getFullPath(download),
                                                            presetId: presets[idx].id,
                                                            downloadId: download.id,
                                                        });
                                                    }
                                                }
                                            } else {
                                                alert('No conversion presets available for this file type.');
                                            }
                                        }}
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        <span>Convert Format</span>
                                    </ContextMenuItem>
                                )}
                                <ContextMenuItem 
                                    className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                                    onClick={() => navigator.clipboard.writeText(download.url)}
                                >
                                    <Copy className="w-4 h-4" />
                                    <span>Copy Link</span>
                                </ContextMenuItem>
                                <ContextMenuItem 
                                    className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06]"
                                    onClick={() => navigator.clipboard.writeText(download.save_path)}
                                >
                                    <FolderOpen className="w-4 h-4" />
                                    <span>Copy Path</span>
                                </ContextMenuItem>
                                <ContextMenuSeparator className="my-1 bg-white/[0.06]" />
                                <ContextMenuItem 
                                    className="flex items-center gap-2.5 cursor-pointer rounded-md px-3 py-2 text-[13px] font-medium text-red-400 hover:bg-red-500/10"
                                    onClick={() => deleteDownload(download.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Delete</span>
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    );
                })}
            </div>
            <DownloadPropertiesModal isOpen={!!propertiesDownload} onClose={() => setPropertiesDownload(null)} download={propertiesDownload} />
            {previewDownload && previewDownload.save_path && (
                <FilePreview
                    filePath={previewDownload.save_path}
                    fileName={previewDownload.file_name}
                    fileSize={previewDownload.total_size ?? undefined}
                    onClose={() => setPreviewDownload(null)}
                />
            )}
        </div>
    );
}