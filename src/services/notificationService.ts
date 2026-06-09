import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

export type NotificationAction = 'pause_all' | 'resume_all' | 'add' | 'open_folder' | 'settings' | 'about';

let trayListenerUnsub: (() => void) | null = null;
const trayHandlers = new Set<(action: NotificationAction) => void>();

export async function checkAndRequestNotificationPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === 'granted';
    }
    return granted;
  } catch {
    return false;
  }
}

export async function sendSystemNotification(title: string, body: string, icon?: string): Promise<void> {
  try {
    await invoke('send_notification', { title, body, icon: icon ?? null });
  } catch (e) {
    console.warn('System notification failed:', e);
  }
}

export async function getAutostartEnabled(): Promise<boolean> {
  try {
    return await invoke<boolean>('is_autostart_enabled');
  } catch {
    return false;
  }
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await invoke('enable_autostart');
    } else {
      await invoke('disable_autostart');
    }
  } catch (e) {
    console.warn('Failed to set autostart:', e);
  }
}

export function onTrayAction(handler: (action: NotificationAction) => void): () => void {
  trayHandlers.add(handler);
  if (!trayListenerUnsub) {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string>('tray-action', (e) => {
        const action = e.payload as NotificationAction;
        trayHandlers.forEach(h => h(action));
      }).then(unlisten => {
        trayListenerUnsub = unlisten;
      });
    });
  }
  return () => {
    trayHandlers.delete(handler);
  };
}

const FILE_TYPE_ICONS: Record<string, string> = {
  video: '🎬',
  audio: '🎵',
  image: '🖼️',
  document: '📄',
  archive: '📦',
  program: '⚙️',
  torrent: '🌊',
  other: '📁',
};

function getFileIcon(filename: string, category?: string): string {
  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes('video')) return FILE_TYPE_ICONS.video;
    if (cat.includes('audio') || cat.includes('music')) return FILE_TYPE_ICONS.audio;
    if (cat.includes('image') || cat.includes('picture')) return FILE_TYPE_ICONS.image;
    if (cat.includes('document') || cat.includes('pdf') || cat.includes('text')) return FILE_TYPE_ICONS.document;
    if (cat.includes('archive') || cat.includes('zip') || cat.includes('compressed')) return FILE_TYPE_ICONS.archive;
    if (cat.includes('program') || cat.includes('app') || cat.includes('exe')) return FILE_TYPE_ICONS.program;
    if (cat.includes('torrent')) return FILE_TYPE_ICONS.torrent;
  }
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'm4v'].includes(ext)) return FILE_TYPE_ICONS.video;
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'].includes(ext)) return FILE_TYPE_ICONS.audio;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return FILE_TYPE_ICONS.image;
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return FILE_TYPE_ICONS.document;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return FILE_TYPE_ICONS.archive;
  if (['exe', 'msi', 'deb', 'rpm', 'appimage', 'dmg'].includes(ext)) return FILE_TYPE_ICONS.program;
  return FILE_TYPE_ICONS.other;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export async function notifyDownloadComplete(
  filename: string,
  category?: string,
  thumbnail?: string | null,
  totalSize?: number | null,
  title?: string | null,
): Promise<void> {
  const displayName = title || filename;
  const fileIcon = getFileIcon(filename, category);
  const sizeStr = formatFileSize(totalSize);
  const body = sizeStr
    ? `${displayName} — ${sizeStr}`
    : displayName;
  await sendSystemNotification(`${fileIcon} Download complete`, body, thumbnail || undefined);
}

export async function notifyDownloadFailed(filename: string, error?: string): Promise<void> {
  const title = 'Download failed';
  const body = error ? `${filename}: ${error}` : filename;
  await sendSystemNotification(title, body);
}
