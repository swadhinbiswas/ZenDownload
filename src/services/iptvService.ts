import { invoke } from '@tauri-apps/api/core';

export interface UserPlaylist {
  id: number;
  name: string;
  url: string;
  country_code: string;
  enabled: boolean;
  created_at: string;
}

export function addUserPlaylist(name: string, url: string, countryCode: string): Promise<number> {
  return invoke<number>('add_user_playlist', { name, url, countryCode });
}

export function listUserPlaylists(): Promise<UserPlaylist[]> {
  return invoke<UserPlaylist[]>('list_user_playlists');
}

export function deleteUserPlaylist(id: number): Promise<void> {
  return invoke<void>('delete_user_playlist', { id });
}

export function importCustomM3u(url: string, countryCode: string): Promise<Array<{ name: string; url: string; tvg_id: string | null; logo: string | null; group: string | null }>> {
  return invoke('import_custom_m3u', { url, countryCode });
}
