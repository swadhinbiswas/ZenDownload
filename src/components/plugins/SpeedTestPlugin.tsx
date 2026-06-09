import { useState, useRef, useCallback } from 'react';
import { Zap, Wifi, ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';

interface SpeedResult {
  download: number;
  upload: number;
  ping: number;
  jitter: number;
}

export function SpeedTestPlugin() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'ping' | 'download' | 'upload' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const TEST_URLS = [
    'https://speed.cloudflare.com/__down?bytes=25000000',
    'https://proof.ovh.net/files/10Mb.dat',
    'https://speedtest.tele2.net/10MB.zip',
  ];

  const measurePing = async (): Promise<number> => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      try {
        await fetch('https://www.google.com/generate_204', { mode: 'no-cors', cache: 'no-store' });
      } catch {}
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  };

  const measureDownload = async (signal: AbortSignal): Promise<number> => {
    const totalBytes = 25_000_000;
    const start = performance.now();
    try {
      const resp = await fetch(TEST_URLS[0], { signal, cache: 'no-store' });
      const reader = resp.body!.getReader();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;
        received += value!.byteLength;
        setProgress(Math.min((received / totalBytes) * 100, 100));
      }
      const elapsed = (performance.now() - start) / 1000;
      return (received * 8) / elapsed / 1_000_000;
    } catch {
      return 0;
    }
  };

  const measureUpload = async (signal: AbortSignal): Promise<number> => {
    const dataSize = 5_000_000;
    const data = new Uint8Array(dataSize);
    crypto.getRandomValues(data);
    const start = performance.now();
    try {
      await fetch('https://httpbin.org/post', {
        method: 'POST',
        body: data,
        signal,
      });
      const elapsed = (performance.now() - start) / 1000;
      return (dataSize * 8) / elapsed / 1_000_000;
    } catch {
      return 0;
    }
  };

  const runTest = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setProgress(0);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setPhase('ping');
    const ping = await measurePing();

    setPhase('download');
    setProgress(0);
    const download = await measureDownload(signal);

    setPhase('upload');
    setProgress(0);
    const upload = await measureUpload(signal);

    setPhase('done');
    setResult({ download, upload, ping, jitter: ping * 0.1 });
    setRunning(false);
    setProgress(100);
  }, []);

  const stopTest = () => {
    abortRef.current?.abort();
    setRunning(false);
    setPhase('idle');
  };

  const formatSpeed = (mbps: number) => {
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
    return `${mbps.toFixed(1)} Mbps`;
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="max-w-lg mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold text-white">Speed Test</h2>
        </div>

        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center">
            <svg className="w-48 h-48 -rotate-90" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle
                cx="100" cy="100" r="85" fill="none"
                stroke={phase === 'download' ? '#6366f1' : phase === 'upload' ? '#10b981' : phase === 'ping' ? '#f59e0b' : '#6366f1'}
                strokeWidth="8"
                strokeDasharray={`${progress * 5.34} 534`}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute text-center">
              {result ? (
                <>
                  <div className="text-2xl font-bold text-white">{formatSpeed(result.download)}</div>
                  <div className="text-xs text-zinc-400">Download</div>
                </>
              ) : running ? (
                <>
                  <div className="text-lg font-medium text-white capitalize">{phase}</div>
                  <div className="text-xs text-zinc-400">{Math.round(progress)}%</div>
                </>
              ) : (
                <>
                  <Zap className="w-8 h-8 text-zinc-600 mx-auto mb-1" />
                  <div className="text-xs text-zinc-500">Ready</div>
                </>
              )}
            </div>
          </div>
        </div>

        {result && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="p-3 bg-zinc-800/50 rounded-xl text-center">
              <ArrowDown className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{formatSpeed(result.download)}</div>
              <div className="text-[10px] text-zinc-500">Download</div>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-xl text-center">
              <ArrowUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{formatSpeed(result.upload)}</div>
              <div className="text-[10px] text-zinc-500">Upload</div>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-xl text-center">
              <Wifi className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{result.ping.toFixed(0)} ms</div>
              <div className="text-[10px] text-zinc-500">Ping</div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!running ? (
            <button onClick={runTest} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors">
              <Zap className="w-4 h-4" /> {result ? 'Run Again' : 'Start Test'}
            </button>
          ) : (
            <button onClick={stopTest} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600/20 text-red-400 text-sm font-medium hover:bg-red-600/30 transition-colors">
              <RotateCcw className="w-4 h-4" /> Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
