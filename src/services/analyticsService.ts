import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface DownloadStat {
  timestamp: number;
  download_id: string;
  event: string;
  bytes: number;
  speed_bps: number;
  category: string | null;
  host: string | null;
}

export interface DayBucket { day: string; count: number; bytes: number; }
export interface NamedCount { name: string; count: number; }
export interface NamedBytes { name: string; bytes: number; }

export interface AnalyticsSummary {
  total_downloads: number;
  total_bytes: number;
  total_time_secs: number;
  avg_speed_bps: number;
  success_rate: number;
  downloads_by_day: DayBucket[];
  downloads_by_category: NamedCount[];
  top_hosts: NamedCount[];
  peak_speed_bps: number;
  current_speed_bps: number;
  largest_download: NamedBytes | null;
}

export const analyticsService = {
  summary: () => invoke<AnalyticsSummary>('get_analytics_summary'),
  recent: (limit: number = 100) => invoke<DownloadStat[]>('get_recent_analytics', { limit }),
  onUpdate: (cb: (summary: AnalyticsSummary) => void): Promise<UnlistenFn> =>
    listen<AnalyticsSummary>('analytics-updated', (e) => cb(e.payload)),
};
