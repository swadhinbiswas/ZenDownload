import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface UrlPattern {
  name: string;
  regex: string;
  category: string;
  priority: number;
}

export interface AutoCategory {
  match_string: string;
  category: string;
}

export interface ClipboardConfig {
  enabled: boolean;
  auto_add: boolean;
  poll_interval_secs: number;
  dedupe_window_secs: number;
  patterns: UrlPattern[];
  ignore_patterns: string[];
  auto_categories: AutoCategory[];
}

export interface DetectedUrl {
  url: string;
  detected_at: number;
  source: string;
  confidence: number;
  pattern: string;
  auto_added: boolean;
  ignored: boolean;
}

export const clipboardService = {
  listDetected: () => invoke<DetectedUrl[]>('list_detected_urls'),
  ignore: (url: string) => invoke<void>('ignore_detected_url', { url }),
  clear: () => invoke<void>('clear_detected_urls'),
  getConfig: () => invoke<ClipboardConfig>('get_clipboard_config'),
  setConfig: (config: ClipboardConfig) => invoke<void>('set_clipboard_config', { config }),
  getText: () => invoke<string>('get_clipboard_text'),
  onDetect: (cb: (url: DetectedUrl) => void): Promise<UnlistenFn> =>
    listen<DetectedUrl>('clipboard-url-detected', (e) => cb(e.payload)),
};
