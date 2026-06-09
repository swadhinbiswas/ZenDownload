import { invoke } from '@tauri-apps/api/core';

export interface ApiServerStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
}

export const apiServerService = {
  getStatus: () => invoke<ApiServerStatus>('get_api_server_status'),
  enable: (port: number) => invoke<void>('set_api_server_enabled', { enabled: true, port }),
  disable: () => invoke<void>('set_api_server_enabled', { enabled: false, port: 0 }),
};
