import { invoke } from '@tauri-apps/api/core';

export interface ProfileSettings {
  default_threads: number;
  max_speed_bps: number | null;
  auto_extract: boolean;
  auto_convert: boolean;
  default_conversion_preset: string | null;
  mirror_enabled: boolean;
  use_debrid: boolean;
  save_path: string | null;
  bandwidth_schedule_id: string | null;
  proxy: string | null;
  retry_attempts: number;
  retry_delay_ms: number;
  checksum_verify: boolean;
  delete_partial_on_error: boolean;
}

export interface DownloadProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  settings: ProfileSettings;
  url_patterns: string[];
  builtin: boolean;
  created_at: number;
}

export const profileService = {
  list: () => invoke<DownloadProfile[]>('list_profiles'),
  get: (id: string) => invoke<DownloadProfile | null>('get_profile', { id }),
  upsert: (profile: DownloadProfile) => invoke<void>('upsert_profile', { profile }),
  remove: (id: string) => invoke<void>('delete_profile', { id }),
  matchUrl: (url: string) => invoke<DownloadProfile | null>('match_url_to_profile', { url }),
};
