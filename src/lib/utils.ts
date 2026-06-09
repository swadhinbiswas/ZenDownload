import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[Math.min(i, sizes.length - 1)]}`;
}

export function sanitizeFilename(name: string) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
}

export type ProxySettings = {
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  proxyUsername?: string;
  proxyPassword?: string;
};

export function buildProxyUrl(settings: ProxySettings | null | undefined) {
  if (!settings || settings.proxyType === 'none' || !settings.proxyHost?.trim()) return null;

  const host = settings.proxyHost.trim();
  const schemeMatch = host.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  const scheme = settings.proxyType === 'socks5' ? 'socks5://' : 'http://';
  const authority = schemeMatch ? host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') : host;
  const finalAuthority = settings.proxyPort && !authority.includes(':') ? `${authority}:${settings.proxyPort.trim()}` : authority;

  if (schemeMatch) {
    return finalAuthority;
  }

  if (settings.proxyUsername) {
    const user = encodeURIComponent(settings.proxyUsername.trim());
    const pass = encodeURIComponent(settings.proxyPassword ?? '');
    return `${scheme}${user}:${pass}@${finalAuthority}`;
  }

  return `${scheme}${finalAuthority}`;
}

export function isPlaylistUrl(url: string) {
  const lower = url.toLowerCase();
  return lower.includes('list=') || lower.includes('/playlist') || lower.includes('/channel/') || lower.includes('/user/') || lower.includes('/@');
}
