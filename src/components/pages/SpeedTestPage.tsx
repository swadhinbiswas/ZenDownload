import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Gauge, Zap, ArrowUp, ArrowDown, Activity, Timer, Server, RefreshCw, History, Wifi, AlertCircle, Globe, BarChart3 } from 'lucide-react';

interface SpeedResult {
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  server: string;
  timestamp: number;
  duration_secs: number;
}

interface ProgressEvent {
  server?: string;
  bytes?: number;
  elapsed?: number;
  mbps?: number;
  progress?: number;
  type?: string;
  status?: string;
}

interface ServerResult {
  server: string;
  download_mbps: number;
  ping_ms: number;
}

function formatSpeed(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  if (mbps >= 0.001) return `${(mbps * 1000).toFixed(1)} Kbps`;
  return '0 Mbps';
}

function getGrade(mbps: number): { label: string; color: string } {
  if (mbps >= 500) return { label: 'Excellent', color: 'text-emerald-400' };
  if (mbps >= 200) return { label: 'Great', color: 'text-emerald-400' };
  if (mbps >= 100) return { label: 'Good', color: 'text-amber-400' };
  if (mbps >= 50) return { label: 'Fair', color: 'text-orange-400' };
  if (mbps >= 10) return { label: 'Poor', color: 'text-red-400' };
  return { label: 'Very Slow', color: 'text-red-500' };
}

export function SpeedTestPage() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'ping' | 'download' | 'upload' | 'multi'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentMbps, setCurrentMbps] = useState(0);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [multiResults, setMultiResults] = useState<ServerResult[]>([]);
  const [history, setHistory] = useState<SpeedResult[]>([]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'quick' | 'multi'>('quick');
  const speedHistory = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || speedHistory.current.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const data = speedHistory.current;
    const max = Math.max(...data, 1);

    ctx.clearRect(0, 0, w, h);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - (data[i] / max) * (h - 4) - 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - (data[i] / max) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, []);

  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  const loadHistory = async () => {
    try {
      const h = await invoke<SpeedResult[]>('get_speed_test_history');
      setHistory(h);
    } catch {}
  };

  useEffect(() => { loadHistory(); }, []);

  const runQuick = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    setProgress(0);
    speedHistory.current = [];

    const unsubs: (() => void)[] = [];
    try {
      const unsubProgress = await listen<ProgressEvent>('speed-test-progress', (e) => {
        const p = e.payload;
        setProgress(p.progress || 0);
        if (p.mbps) {
          setCurrentMbps(p.mbps);
          speedHistory.current.push(p.mbps);
        }
      });
      unsubs.push(unsubProgress);

      const unsubStart = await listen<any>('speed-test-start', (ev) => {
        setPhase(ev.payload.status || 'download');
      });
      unsubs.push(unsubStart);

      const unsubComplete = await listen<SpeedResult>('speed-test-complete', () => {});
      unsubs.push(unsubComplete);

      setPhase('ping');
      const r = await invoke<SpeedResult>('run_full_speed_test');
      setResult(r);
      setPhase('idle');
      loadHistory();
    } catch (e: any) {
      setError(e.toString());
      setPhase('idle');
    } finally {
      setRunning(false);
      unsubs.forEach(u => u());
    }
  };

  const runMulti = async () => {
    setRunning(true);
    setError('');
    setMultiResults([]);
    setProgress(0);

    const unsubs: (() => void)[] = [];
    try {
      const unsubProgress = await listen<ProgressEvent>('speed-test-progress', (e) => {
        const p = e.payload;
        if (p.server) {
          setMultiResults(prev => {
            const exists = prev.findIndex(r => r.server === p.server);
            const mbps = p.mbps || 0;
            if (exists >= 0) {
              const updated = [...prev];
              updated[exists] = { ...updated[exists], download_mbps: mbps };
              return updated;
            }
            return [...prev, { server: p.server!, download_mbps: mbps, ping_ms: 0 }];
          });
        }
        setProgress(p.progress || 0);
      });
      unsubs.push(unsubProgress);

      const unsubStart = await listen<any>('speed-test-start', () => {
        setPhase('multi');
      });
      unsubs.push(unsubStart);

      const results = await invoke<ServerResult[]>('run_multi_server_test');
      setMultiResults(results);
      setPhase('idle');
    } catch (e: any) {
      setError(e.toString());
      setPhase('idle');
    } finally {
      setRunning(false);
      unsubs.forEach(u => u());
    }
  };

  const startTest = () => {
    if (mode === 'quick') runQuick();
    else runMulti();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3">
          <Gauge className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-semibold text-white tracking-tight">Speed Test</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
            <button
              onClick={() => setMode('quick')}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${mode === 'quick' ? 'bg-indigo-600 text-white' : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-300'}`}
            >Quick</button>
            <button
              onClick={() => setMode('multi')}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${mode === 'multi' ? 'bg-indigo-600 text-white' : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-300'}`}
            >Multi-Server</button>
          </div>
          <button
            onClick={startTest}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {running ? 'Testing...' : 'Start Test'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">

          {/* Main Result */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 border border-white/[0.06]">
            {/* Background grid */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }} />
            <div className="relative p-8">
              {running ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <Activity className="w-8 h-8 text-indigo-400 animate-pulse" />
                  </div>
                  <p className="text-zinc-400 text-[13px] mb-1">
                    {phase === 'ping' && 'Measuring latency...'}
                    {phase === 'download' && 'Testing download speed...'}
                    {phase === 'upload' && 'Testing upload speed...'}
                  </p>
                  <div className="max-w-md mx-auto mt-4">
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  {currentMbps > 0 && (
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-white">{formatSpeed(currentMbps)}</span>
                    </div>
                  )}
                  {speedHistory.current.length > 0 && (
                    <div className="mt-4 max-w-md mx-auto">
                      <canvas ref={canvasRef} width={400} height={60} className="w-full h-15 rounded-lg" />
                    </div>
                  )}
                </div>
              ) : result ? (
                <div>
                  <div className="flex items-center justify-center gap-2 mb-6">
                    <Wifi className="w-5 h-5 text-indigo-400" />
                    <span className={`text-sm font-medium ${getGrade(result.download_mbps).color}`}>
                      {getGrade(result.download_mbps).label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <ArrowDown className="w-4 h-4 text-emerald-400" />
                        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Download</span>
                      </div>
                      <p className="text-3xl font-bold text-white">{formatSpeed(result.download_mbps)}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <ArrowUp className="w-4 h-4 text-sky-400" />
                        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Upload</span>
                      </div>
                      <p className="text-3xl font-bold text-white">{formatSpeed(result.upload_mbps)}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Timer className="w-4 h-4 text-amber-400" />
                        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Latency</span>
                      </div>
                      <p className="text-3xl font-bold text-white">{result.ping_ms.toFixed(0)} <span className="text-lg text-zinc-500">ms</span></p>
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-white/[0.04] flex items-center justify-between text-[12px] text-zinc-600">
                    <span className="flex items-center gap-1"><Server className="w-3 h-3" /> {result.server}</span>
                    <span>{new Date(result.timestamp * 1000).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-900/50 flex items-center justify-center">
                    <Gauge className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-zinc-500 text-[13px]">Run a speed test to measure your connection</p>
                  <p className="text-zinc-700 text-[11px] mt-1">Tests against Cloudflare, Google, and Linode servers</p>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-[12px] text-red-300">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Server Results */}
          {multiResults.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-zinc-400" />
                <h2 className="text-[13px] font-medium text-white">Multi-Server Results</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {multiResults.map((r) => (
                  <div key={r.server} className="p-4 rounded-xl bg-zinc-900/30 border border-white/[0.04]">
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-[12px] font-medium text-zinc-300">{r.server}</span>
                    </div>
                    <p className="text-xl font-bold text-white">{formatSpeed(r.download_mbps)}</p>
                    {r.ping_ms > 0 && <p className="text-[11px] text-zinc-600 mt-1">{r.ping_ms.toFixed(0)} ms ping</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Limits */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-zinc-400" />
              <h2 className="text-[13px] font-medium text-white">Current Limits</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-zinc-900/30 border border-white/[0.04]">
                <p className="text-[11px] text-zinc-600 mb-0.5">Max Concurrent</p>
                <p className="text-[15px] font-semibold text-zinc-200">8 downloads</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/30 border border-white/[0.04]">
                <p className="text-[11px] text-zinc-600 mb-0.5">Default Connections</p>
                <p className="text-[15px] font-semibold text-zinc-200">8 per download</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/30 border border-white/[0.04]">
                <p className="text-[11px] text-zinc-600 mb-0.5">Speed Limit</p>
                <p className="text-[15px] font-semibold text-zinc-200">Unlimited</p>
              </div>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-zinc-400" />
                <h2 className="text-[13px] font-medium text-white">Test History</h2>
              </div>
              <div className="space-y-1">
                {[...history].reverse().map((h, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2 rounded-xl bg-zinc-900/20 border border-white/[0.03]">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${getGrade(h.download_mbps).color.replace('text-', 'bg-')}`} />
                      <span className="text-[12px] text-zinc-400">{new Date(h.timestamp * 1000).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[12px]">
                      <span className="text-zinc-300">{formatSpeed(h.download_mbps)} ↓</span>
                      {h.upload_mbps > 0 && <span className="text-zinc-500">{formatSpeed(h.upload_mbps)} ↑</span>}
                      <span className="text-zinc-600">{h.ping_ms.toFixed(0)}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
