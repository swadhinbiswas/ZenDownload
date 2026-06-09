import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';

export interface FeedEvent {
  id: string;
  type: 'download.start' | 'download.complete' | 'download.error' | 'plugin.fired' | 'system.update' | 'metadata.updated';
  title: string;
  description: string;
  timestamp: number;
  icon: string;
  downloadId?: string;
}

interface FeedStore {
  events: FeedEvent[];
  unread: number;
  addEvent: (event: Omit<FeedEvent, 'id' | 'timestamp'>) => void;
  markAllRead: () => void;
  clearOld: (maxAge: number) => void;
  setupListeners: () => Promise<void>;
}

let eventCounter = 0;

export const useFeedStore = create<FeedStore>((set, get) => ({
  events: [],
  unread: 0,
  addEvent: (event) => {
    eventCounter++;
    const feedEvent: FeedEvent = {
      ...event,
      id: `feed-${Date.now()}-${eventCounter}`,
      timestamp: Date.now(),
    };
    set((state) => ({
      events: [feedEvent, ...state.events].slice(0, 200),
      unread: state.unread + 1,
    }));
  },
  markAllRead: () => set({ unread: 0 }),
  clearOld: (maxAge) => {
    const cutoff = Date.now() - maxAge;
    set((state) => ({
      events: state.events.filter(e => e.timestamp > cutoff),
    }));
  },
  setupListeners: async () => {
    const add = get().addEvent;

    await listen<{id: string, status: string}>('download-status', (event) => {
      const { id, status } = event.payload;
      if (status === 'Completed') {
        add({ type: 'download.complete', title: 'Download Complete', description: id, icon: 'check-circle', downloadId: id });
      } else if (status === 'Error') {
        add({ type: 'download.error', title: 'Download Failed', description: id, icon: 'alert-circle', downloadId: id });
      } else if (status === 'Downloading') {
        add({ type: 'download.start', title: 'Download Started', description: id, icon: 'download', downloadId: id });
      }
    });

    await listen<{plugin: string, hook: string}>('plugin-fired', (event) => {
      add({ type: 'plugin.fired', title: `Plugin: ${event.payload.plugin}`, description: `Hook: ${event.payload.hook}`, icon: 'puzzle', downloadId: undefined });
    });

    await listen<{id: string, title?: string}>('metadata-updated', (event) => {
      if (event.payload.title) {
        add({ type: 'metadata.updated', title: 'Metadata Updated', description: event.payload.title, icon: 'info', downloadId: event.payload.id });
      }
    });
  },
}));
