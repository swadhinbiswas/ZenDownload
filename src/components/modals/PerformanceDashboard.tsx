import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Activity, Gauge, HardDrive, Wifi, AlertTriangle, CheckCircle2, Play, Loader2, RefreshCw, Network } from 'lucide-react';

interface PerformanceDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SpeedResult {
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  server: string;
  duration_secs: number;
}

interface DiagnosticsReport {
  version: string;
  os: string;
  arch: string;
  total_memory_bytes: number;
  used_memory_bytes: number;
  cpu_count: number;
  disk_free_bytes: number;
  disk_total_bytes: number;
  active_downloads: number;
  paused_downloads: number;
  completed_downloads: number;
  failed_downloads: number;
  network_interfaces: Array<{ name: string; mac: string; ip_addresses: string[]; is_up: boolean; is_loopback: boolean }>;
  generated_at: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
}

function formatMbps(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

export function PerformanceDashboard({ isOpen, onClose }: PerformanceDashboardProps) {
  const [speedDown, setSpeedDown] = useState<SpeedResult | null>(null);
  const [speedUp, setSpeedUp] = useState<SpeedResult | null>(null);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [testing, setTesting] = useState<'down' | 'up' | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadReport();
    }
  }, [isOpen]);

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      const r = await invoke<DiagnosticsReport>('generate_diagnostics_report');
      setReport(r);
    } catch (e) {
      console.error('Diagnostics failed:', e);
    } finally {
      setLoadingReport(false);
    }
  };

  const runDownloadTest = async () => {
    setTesting('down');
    try {
      const result = await invoke<SpeedResult>('run_speed_test_download');
      setSpeedDown(result);
    } catch (e) {
      console.error('Download speed test failed:', e);
    } finally {
      setTesting(null);
    }
  };

  const runUploadTest = async () => {
    setTesting('up');
    try {
      const result = await invoke<SpeedResult>('run_speed_test_upload');
      setSpeedUp(result);
    } catch (e) {
      console.error('Upload speed test failed:', e);
    } finally {
      setTesting(null);
    }
  };

  const runPing = async () => {
    try {
      const ms = await invoke<number>('ping_host', { host: 'cloudflare.com' });
      setPingMs(ms);
    } catch (e) {
      console.error('Ping failed:', e);
    }
  };

  const memUsagePct = report ? (report.used_memory_bytes / report.total_memory_bytes) * 100 : 0;
  const diskUsagePct = report && report.disk_total_bytes > 0
    ? ((report.disk_total_bytes - report.disk_free_bytes) / report.disk_total_bytes) * 100
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-[95vw] md:max-w-[1100px] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl">
        <div className="p-8 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="mb-6 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">Performance & Diagnostics</DialogTitle>
                <p className="text-sm text-zinc-500 mt-0.5">Speed tests, system health, and download statistics</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-md text-zinc-500 hover:text-white">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="w-4 h-4">
                <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" />
              </svg>
            </Button>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-white/[0.06] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-semibold text-zinc-300">Speed Test</span>
                </div>
                <span className="text-xs text-zinc-500 font-mono">via Cloudflare</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900/50 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-1">Download</div>
                  <div className="text-2xl font-bold text-white mb-2">
                    {speedDown ? formatMbps(speedDown.download_mbps) : '—'}
                  </div>
                  <Button
                    onClick={runDownloadTest}
                    disabled={testing !== null}
                    size="sm"
                    className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20"
                  >
                    {testing === 'down' ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Play className="w-3 h-3 mr-1.5" />}
                    Test Download
                  </Button>
                </div>
                <div className="bg-zinc-900/50 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-1">Upload</div>
                  <div className="text-2xl font-bold text-white mb-2">
                    {speedUp ? formatMbps(speedUp.upload_mbps) : '—'}
                  </div>
                  <Button
                    onClick={runUploadTest}
                    disabled={testing !== null}
                    size="sm"
                    className="w-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20"
                  >
                    {testing === 'up' ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Play className="w-3 h-3 mr-1.5" />}
                    Test Upload
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <button onClick={runPing} className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 transition-colors">
                  <Wifi className="w-3 h-3" />
                  Ping cloudflare.com
                </button>
                {pingMs !== null && (
                  <span className="text-zinc-400 font-mono">{pingMs.toFixed(0)} ms</span>
                )}
              </div>
            </div>

            <div className="bg-zinc-900/30 border border-white/[0.06] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-zinc-300">System</span>
                </div>
                <button onClick={loadReport} disabled={loadingReport} className="text-zinc-500 hover:text-zinc-300">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingReport ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {report ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between text-zinc-400 mb-1">
                      <span>Memory</span>
                      <span className="font-mono">{formatBytes(report.used_memory_bytes)} / {formatBytes(report.total_memory_bytes)}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${memUsagePct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-zinc-400 mb-1">
                      <span>Disk</span>
                      <span className="font-mono">{formatBytes(report.disk_free_bytes)} free</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all" style={{ width: `${diskUsagePct}%` }} />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/5 space-y-1.5 text-zinc-500">
                    <div className="flex justify-between"><span>CPU cores</span><span className="font-mono text-zinc-400">{report.cpu_count}</span></div>
                    <div className="flex justify-between"><span>OS</span><span className="font-mono text-zinc-400">{report.os}/{report.arch}</span></div>
                    <div className="flex justify-between"><span>Version</span><span className="font-mono text-zinc-400">v{report.version}</span></div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-500 text-center py-4">Loading system info...</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Active" value={report?.active_downloads ?? 0} color="indigo" icon={<Activity className="w-4 h-4" />} />
            <StatCard label="Paused" value={report?.paused_downloads ?? 0} color="amber" icon={<AlertTriangle className="w-4 h-4" />} />
            <StatCard label="Completed" value={report?.completed_downloads ?? 0} color="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
            <StatCard label="Failed" value={report?.failed_downloads ?? 0} color="red" icon={<AlertTriangle className="w-4 h-4" />} />
          </div>

          {report && report.network_interfaces.length > 0 && (
            <div className="bg-zinc-900/30 border border-white/[0.06] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Network className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-zinc-300">Network Interfaces</span>
              </div>
              <div className="space-y-2">
                {report.network_interfaces.map((iface) => (
                  <div key={iface.name} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl text-xs">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${iface.is_up ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      <span className="text-zinc-200 font-medium">{iface.name}</span>
                      {iface.is_loopback && <span className="text-zinc-600 text-[10px] uppercase tracking-wider">loopback</span>}
                    </div>
                    <div className="flex items-center gap-4 text-zinc-500 font-mono">
                      {iface.ip_addresses[0] && <span>{iface.ip_addresses[0]}</span>}
                      <span className="text-zinc-700">{iface.mac}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
  };
  return (
    <div className="bg-zinc-900/30 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className={colorMap[color]}>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
    </div>
  );
}
