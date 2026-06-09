export type PluginType =
  | 'extractor'
  | 'postprocessor'
  | 'webhook'
  | 'notifier'
  | 'protocolhandler'
  | 'mirror'
  | 'ui';

export type PluginCategory =
  | 'media'
  | 'productivity'
  | 'downloader'
  | 'notification'
  | 'utility'
  | 'fun';

export interface ConfigOptionSelect {
  label: string;
  value: string;
}

export interface ConfigOption {
  key: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'password';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: ConfigOptionSelect[];
}

export interface UiManifest {
  sidebar_label: string;
  sidebar_icon: string;
  component_type: string;
  page_config: any;
  asset_dir: string | null;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  homepage: string | null;
  plugin_type: PluginType;
  enabled: boolean;
  config: Record<string, any>;
  hooks: string[];
  installed_at: number;
  path: string | null;
  ui: UiManifest | null;
  // New fields
  icon: string;
  category: PluginCategory;
  tags: string[];
  min_version: string | null;
  screenshots: string[];
  config_schema: ConfigOption[];
  downloads: number;
}

export interface PluginHook {
  name: string;
  description: string;
}

export interface CatalogPlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  plugin_type: PluginType;
  hooks: string[];
  homepage: string;
  downloads: number;
  icon: string;
  category: PluginCategory;
  tags: string[];
  config_schema?: ConfigOption[];
  ui?: {
    sidebar_label: string;
    sidebar_icon: string;
    component_type: string;
    page_config?: any;
  };
}

export const PLUGIN_CATEGORY_META: Record<PluginCategory, { label: string; icon: string }> = {
  media: { label: 'Media', icon: '🎬' },
  productivity: { label: 'Productivity', icon: '⚡' },
  downloader: { label: 'Downloader', icon: '⬇️' },
  notification: { label: 'Notification', icon: '🔔' },
  utility: { label: 'Utility', icon: '🛠️' },
  fun: { label: 'Fun', icon: '🎮' },
};

export const PLUGIN_TYPE_META: Record<PluginType, { label: string; color: string }> = {
  extractor: { label: 'Extractor', color: 'text-blue-400' },
  postprocessor: { label: 'Post-Processor', color: 'text-emerald-400' },
  webhook: { label: 'Webhook', color: 'text-purple-400' },
  notifier: { label: 'Notifier', color: 'text-amber-400' },
  protocolhandler: { label: 'Protocol', color: 'text-cyan-400' },
  mirror: { label: 'Mirror', color: 'text-pink-400' },
  ui: { label: 'UI App', color: 'text-indigo-400' },
};
