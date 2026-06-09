import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from './settingsStore';

export interface Download {
    id: string;
    url: string;
    file_name: string;
    save_path: string;
    total_size: number | null;
    downloaded: number;
    status: 'Pending' | 'Queued' | 'Downloading' | 'Paused' | 'Completed' | 'Error' | 'Needs Refresh' | 'Cancelled';
    category: string | null;
    created_at: string | null;
    completed_at?: string | null;
    download_type?: string;
    currentSpeed?: number;
    avgSpeed?: number;
    priority?: number;
    thumbnail?: string | null;
    title?: string | null;
    resolution?: string | null;
}

interface ProgressPayload {
    id: string;
    downloaded: number;
    speed: number;
}

interface StatusPayload {
    id: string;
    status: Download['status'];
}

interface SizePayload {
    id: string;
    size: number;
}

export interface TorrentPeerStats {
    active_peers: number;
    total_peers: number;
    down_speed: number;
    up_speed: number;
    progress: number;
    downloaded: number;
    uploaded: number;
    total_size: number;
}

interface DownloadStore {
    downloads: Download[];
    selectedIds: Set<string>;
    isListening: boolean;
    torrentStats: Map<string, TorrentPeerStats>;
    speedHistory: Map<string, number[]>;
    setupListeners: () => Promise<void>;
    fetchDownloads: () => Promise<void>;
    addDownload: (url: string, savePath: string, threads: number, category: string | null, extraMeta?: string) => Promise<void>;
    addTorrentFile: (filePath: string, savePath: string) => Promise<void>;
    updateProgress: (id: string, downloadedBytes: number, currentSpeed: number) => void;
    updateStatus: (id: string, status: Download['status']) => void;
    filterCategory: string | null;
    setFilterCategory: (category: string | null) => void;
    currentView: 'downloads' | 'subscriptions' | 'history' | 'grabber' | 'stream' | 'music' | 'playlist' | 'adult' | 'tv' | 'site_grabber' | 'advanced' | 'feed' | 'plugins' | 'plugin_store' | 'plugin_page' | 'speedtest';
    setCurrentView: (view: 'downloads' | 'subscriptions' | 'history' | 'grabber' | 'stream' | 'music' | 'playlist' | 'adult' | 'tv' | 'site_grabber' | 'advanced' | 'feed' | 'plugins' | 'plugin_store' | 'plugin_page' | 'speedtest') => void;
    toggleSelection: (id: string) => void;
    clearSelection: () => void;
    selectAll: () => void;
    resumeSelected: () => Promise<void>;
    pauseSelected: () => Promise<void>;
    cancelSelected: () => Promise<void>;
    deleteDownload: (id: string) => Promise<void>;
    deleteSelected: () => Promise<void>;
    reorderDownloads: (orderedIds: string[]) => void;
    setDownloadPriority: (id: string, priority: number) => Promise<void>;
    pauseAll: () => Promise<void>;
    resumeAll: () => Promise<void>;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
    downloads: [],
    selectedIds: new Set(),
    torrentStats: new Map(),
    speedHistory: new Map(),
    filterCategory: null,
    setFilterCategory: (category) => set({ filterCategory: category, currentView: 'downloads' }),
    currentView: 'downloads',
    setCurrentView: (view) => set({ currentView: view }),
    isListening: false,
    setupListeners: async () => {
        if (get().isListening) return;
        set({ isListening: true });

        await listen<ProgressPayload>('download-progress', (event) => {
            get().updateProgress(event.payload.id, event.payload.downloaded, event.payload.speed);
        });

        await listen<StatusPayload>('download-status', (event) => {
            const prev = get().downloads.find(d => d.id === event.payload.id);
            get().updateStatus(event.payload.id, event.payload.status);
            if (prev && prev.status !== event.payload.status) {
                if (event.payload.status === 'Completed') {
                    import('../services/notificationService').then(n => {
                        const d = get().downloads.find(x => x.id === event.payload.id);
                        if (d && useSettingsStore.getState().osNotifications) {
                            n.notifyDownloadComplete(
                                d.file_name || 'Download',
                                d.category || undefined,
                                d.thumbnail,
                                d.total_size,
                                d.title,
                            );
                        }
                    });
                } else if (event.payload.status === 'Error') {
                    import('../services/notificationService').then(n => {
                        const d = get().downloads.find(x => x.id === event.payload.id);
                        if (d && useSettingsStore.getState().osNotifications) {
                            n.notifyDownloadFailed(d.file_name || 'Download');
                        }
                    });
                }
            }
        });

        await listen<SizePayload>('download-size', (event) => {
            set((state) => ({
                downloads: state.downloads.map(d => 
                    d.id === event.payload.id ? { ...d, total_size: event.payload.size } : d
                )
            }));
        });

        await listen<{id: string, filename: string}>('download-filename', (event) => {
            set((state) => ({
                downloads: state.downloads.map(d => 
                    d.id === event.payload.id ? { ...d, file_name: event.payload.filename } : d
                )
            }));
        });

        await listen<{id: string, stats: TorrentPeerStats}>('torrent-stats', (event) => {
            set((state) => {
                const next = new Map(state.torrentStats);
                next.set(event.payload.id, event.payload.stats);
                return { torrentStats: next };
            });
        });

        await listen<{id: string, title?: string, resolution?: string, thumbnail?: string}>('metadata-updated', (event) => {
            set((state) => ({
                downloads: state.downloads.map(d =>
                    d.id === event.payload.id ? {
                        ...d,
                        title: event.payload.title ?? d.title,
                        resolution: event.payload.resolution ?? d.resolution,
                        thumbnail: event.payload.thumbnail ?? d.thumbnail,
                    } : d
                )
            }));
        });
    },
    fetchDownloads: async () => {
        try {
            const downloads = await invoke<Download[]>('get_downloads');
            set({ downloads });
        } catch (error) {
            console.error('Failed to fetch downloads:', error);
        }
    },
    addDownload: async (url, savePath, threads, category, extraMeta) => {
        try {
            await invoke('add_download', { url, savePath, threads, category, extraMeta: extraMeta || null });
            await get().fetchDownloads();
        } catch (error) {
            console.error('Failed to add download:', error);
            throw error;
        }
    },
    addTorrentFile: async (filePath, savePath) => {
        try {
            await invoke('add_torrent_file', { filePath, savePath });
            await get().fetchDownloads();
        } catch (error) {
            console.error('Failed to add torrent file:', error);
            throw error;
        }
    },
    toggleSelection: (id) => {
        set((state) => {
            const next = new Set(state.selectedIds);
            if (next.has(id)) {
                next.delete(id);
            } else {
                // Multi-select: just add the new id, do NOT clear other selections.
                next.add(id);
            }
            return { selectedIds: next };
        });
    },
    clearSelection: () => set({ selectedIds: new Set() }),
    resumeSelected: async () => {
        const { selectedIds } = get();
        for (const id of selectedIds) await invoke('resume_download', { id });
    },
    pauseSelected: async () => {
        const { selectedIds } = get();
        for (const id of selectedIds) await invoke('pause_download', { id });
    },
    cancelSelected: async () => {
        const { selectedIds } = get();
        for (const id of selectedIds) await invoke('cancel_download', { id });
    },
    deleteDownload: async (id: string) => {
        try {
            await invoke('delete_download', { id });
        } catch (e) {
            console.error('Failed to delete download:', e);
        }
        await get().fetchDownloads();
    },
    deleteSelected: async () => {
        const { selectedIds } = get();
        for (const id of selectedIds) {
            try {
                await invoke('delete_download', { id });
            } catch (e) {
                console.error('Failed to delete download:', e);
            }
        }
        get().fetchDownloads();
    },
    reorderDownloads: (orderedIds) => {
        set((state) => {
            const lookup = new Map(state.downloads.map(d => [d.id, d]));
            const reordered: typeof state.downloads = [];
            for (const id of orderedIds) {
                const d = lookup.get(id);
                if (d) {
                    reordered.push({ ...d, priority: orderedIds.length - orderedIds.indexOf(id) });
                    lookup.delete(id);
                }
            }
            // Append any downloads not in the ordered list
            for (const d of lookup.values()) reordered.push(d);
            return { downloads: reordered };
        });
    },
    setDownloadPriority: async (id, priority) => {
        set((state) => ({
            downloads: state.downloads.map(d => d.id === id ? { ...d, priority } : d)
        }));
        // Note: priority is currently session-only; could be persisted via
        // a dedicated runtime_setting key in a future enhancement.
    },
    updateProgress: (id, downloadedBytes, currentSpeed) => {
        set((state) => {
            const next = new Map(state.speedHistory);
            const history = next.get(id) || [];
            const updated = [...history, currentSpeed].slice(-30);
            next.set(id, updated);
            return {
                downloads: state.downloads.map(d =>
                    d.id === id ? { ...d, downloaded: downloadedBytes, currentSpeed } : d
                ),
                speedHistory: next,
            };
        });
    },
    updateStatus: (id, status) => {
        set((state) => ({
            downloads: state.downloads.map(d => {
                if (d.id === id && status === 'Completed') {
                    // Calculate average speed
                    const completedAt = new Date();
                    const createdAt = d.created_at ? new Date(d.created_at) : completedAt;
                    const elapsedSeconds = (completedAt.getTime() - createdAt.getTime()) / 1000;
                    const avgSpeed = elapsedSeconds > 0 ? (d.total_size ?? d.downloaded) / elapsedSeconds : 0;
                    
                    return { 
                        ...d, 
                        status,
                        downloaded: d.total_size ?? d.downloaded,
                        completed_at: completedAt.toISOString(),
                        avgSpeed,
                        currentSpeed: 0
                    };
                }
                return d.id === id ? { ...d, status } : d;
            })
        }));
    },
    selectAll: () => {
        set((state) => {
            const ids = new Set(state.downloads.map(d => d.id));
            return { selectedIds: ids };
        });
    },
    pauseAll: async () => {
        const { downloads } = get();
        const active = downloads.filter(d => d.status === 'Downloading' || d.status === 'Queued');
        for (const d of active) {
            try { await invoke('pause_download', { id: d.id }); } catch {}
        }
        set((state) => ({
            downloads: state.downloads.map(d =>
                (d.status === 'Downloading' || d.status === 'Queued') ? { ...d, status: 'Paused' as const } : d
            )
        }));
    },
    resumeAll: async () => {
        const { downloads } = get();
        const paused = downloads.filter(d => d.status === 'Paused');
        for (const d of paused) {
            try { await invoke('resume_download', { id: d.id }); } catch {}
        }
        set((state) => ({
            downloads: state.downloads.map(d =>
                d.status === 'Paused' ? { ...d, status: 'Queued' as const } : d
            )
        }));
    },
}));
