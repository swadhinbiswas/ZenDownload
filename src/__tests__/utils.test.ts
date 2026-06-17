import { describe, it, expect } from 'vitest';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function computeProgress(downloaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, (downloaded / total) * 100);
}

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
  it('formats KiB correctly', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });
  it('formats MiB correctly', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
  it('formats GiB correctly', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('formatSpeed', () => {
  it('includes /s suffix', () => {
    expect(formatSpeed(1048576)).toBe('1.0 MB/s');
  });
});

describe('formatDuration', () => {
  it('handles zero', () => {
    expect(formatDuration(0)).toBe('--:--');
  });
  it('formats minutes:seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });
  it('formats hours:minutes:seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('computeProgress', () => {
  it('returns 0 for unknown total', () => {
    expect(computeProgress(500, 0)).toBe(0);
  });
  it('computes percentage', () => {
    expect(computeProgress(50, 100)).toBe(50);
  });
  it('caps at 100', () => {
    expect(computeProgress(200, 100)).toBe(100);
  });
});
