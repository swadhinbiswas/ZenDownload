import { invoke } from '@tauri-apps/api/core';

export interface Mirror {
  id: string;
  url: string;
  region: string;
  priority: number;
  enabled: boolean;
  last_latency_ms: number;
  last_status: number;
  last_checked: number;
  success_count: number;
  failure_count: number;
  avg_speed_bps: number;
  health_score: number;
}

export interface MirrorConfig {
  enabled: boolean;
  check_interval_secs: number;
  request_timeout_secs: number;
  failover_threshold: number;
  parallel_mirrors: number;
  smart_routing: boolean;
}

export const mirrorService = {
  list: () => invoke<Mirror[]>('list_mirrors'),
  add: (mirror: Mirror) => invoke<string>('add_mirror', { mirror }),
  remove: (id: string) => invoke<void>('remove_mirror', { id }),
  getConfig: () => invoke<MirrorConfig>('get_mirror_config'),
  setConfig: (config: MirrorConfig) => invoke<void>('set_mirror_config', { config }),
};
