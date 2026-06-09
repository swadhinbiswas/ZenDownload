import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Plugin, UiManifest } from '../types/plugin';

export type { Plugin, UiManifest };

interface PluginStore {
  uiPlugins: Plugin[];
  loading: boolean;
  currentPluginId: string | null;
  load: () => Promise<void>;
  setCurrentPlugin: (id: string | null) => void;
}

export const usePluginStore = create<PluginStore>((set) => ({
  uiPlugins: [],
  loading: false,
  currentPluginId: null,
  load: async () => {
    set({ loading: true });
    try {
      const plugins = await invoke<Plugin[]>('list_ui_plugins');
      set({ uiPlugins: plugins.filter(p => p.enabled) });
    } catch {
      set({ uiPlugins: [] });
    } finally {
      set({ loading: false });
    }
  },
  setCurrentPlugin: (id) => set({ currentPluginId: id }),
}));
