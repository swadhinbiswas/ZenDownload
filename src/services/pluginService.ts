import { invoke } from '@tauri-apps/api/core';
import type { Plugin, ConfigOption, PluginHook, CatalogPlugin } from '../types/plugin';

export type { Plugin, ConfigOption, PluginHook, CatalogPlugin };

export const PLUGIN_CATALOG_URL = 'https://api.zendownload.eu.cc/plugins';
export const PLUGIN_CATALOG_FALLBACK_URL = 'https://raw.githubusercontent.com/swadhinbiswas/ZenDownload/main/catalog.json';

export const pluginService = {
  list: () => invoke<Plugin[]>('list_plugins'),
  get: (id: string) => invoke<Plugin | null>('get_plugin', { id }),
  install: (plugin: Plugin) => invoke<string>('install_plugin', { plugin }),
  uninstall: (id: string) => invoke<void>('uninstall_plugin', { id }),
  enable: (id: string) => invoke<void>('enable_plugin', { id }),
  disable: (id: string) => invoke<void>('disable_plugin', { id }),
  updateConfig: (id: string, config: Record<string, any>) =>
    invoke<void>('update_plugin_config', { id, config }),
  getConfigSchema: (id: string) =>
    invoke<ConfigOption[]>('get_plugin_config_schema', { id }),
  listHooks: () => invoke<PluginHook[]>('list_plugin_hooks'),
  fetchCatalog: async (url?: string) => {
    if (url) {
      return invoke<CatalogPlugin[]>('fetch_plugin_catalog', { url });
    }
    try {
      return await invoke<CatalogPlugin[]>('fetch_plugin_catalog', { url: PLUGIN_CATALOG_URL });
    } catch {
      return invoke<CatalogPlugin[]>('fetch_plugin_catalog', { url: PLUGIN_CATALOG_FALLBACK_URL });
    }
  },
};
