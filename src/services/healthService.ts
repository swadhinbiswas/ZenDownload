import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface HealthSnapshot {
  timestamp: number;
  status: number;
  latency_ms: number;
  size: number | null;
  error: string | null;
}

export interface HealthCheck {
  download_id: string;
  url: string;
  last_checked: number;
  last_status: number;
  last_size: number | null;
  last_etag: string | null;
  last_modified: string | null;
  content_type: string | null;
  consecutive_failures: number;
  avg_latency_ms: number;
  bandwidth_kbps: number;
  history: HealthSnapshot[];
}

export interface HealthConfig {
  enabled: boolean;
  check_interval_secs: number;
  request_timeout_secs: number;
  max_concurrent_checks: number;
  auto_pause_threshold: number;
  notify_on_failure: boolean;
  verify_checksum: boolean;
}

export const healthService = {
  list: () => invoke<HealthCheck[]>('list_health_checks'),
  getConfig: () => invoke<HealthConfig>('get_health_config'),
  setConfig: (config: HealthConfig) => invoke<void>('set_health_config', { config }),
  onUpdate: (cb: (check: HealthCheck) => void): Promise<UnlistenFn> =>
    listen<HealthCheck>('health-monitor-updated', (e) => cb(e.payload)),
  onPaused: (cb: (id: string) => void): Promise<UnlistenFn> =>
    listen<string>('health-monitor-paused', (e) => cb(e.payload)),
};
