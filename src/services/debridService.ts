import { invoke } from '@tauri-apps/api/core';

export type DebridProvider = 'realdedbrid' | 'alldebrid' | 'premiumize' | 'debridlink' | 'offcloud';

export interface DebridAccount {
  id: string;
  provider: DebridProvider;
  api_key: string;
  enabled: boolean;
  priority: number;
  label: string;
}

export interface DebridStatus {
  id: string;
  provider: DebridProvider;
  valid: boolean;
  user: string | null;
  premium_until: string | null;
  traffic_left_gb: number | null;
  last_checked: number;
  error: string | null;
}

export const debridService = {
  list: () => invoke<DebridAccount[]>('list_debrid_accounts'),
  upsert: (account: DebridAccount) => invoke<string>('upsert_debrid_account', { account }),
  remove: (id: string) => invoke<void>('delete_debrid_account', { id }),
  verify: (id: string) => invoke<DebridStatus>('verify_debrid_account', { id }),
  listStatuses: () => invoke<DebridStatus[]>('list_debrid_statuses'),
  unrestrict: (url: string) => invoke<string>('debrid_unrestrict', { url }),
};
