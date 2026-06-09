import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Globe, Copy, Check, Package, MousePointerClick, Zap, RefreshCw } from 'lucide-react';

interface BrowserSetupResult {
  browser: string;
  name: string;
  native_messaging: boolean;
  extension_loaded: boolean;
  message: string;
}

export function BrowserExtensionSection() {
  const [manifestPath, setManifestPath] = useState<string>('');
  const [manifest, setManifest] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [results, setResults] = useState<BrowserSetupResult[] | null>(null);

  const fetchManifest = async (browser: string) => {
    try {
      const path = await invoke<string>('get_native_messaging_manifest_path', { browser });
      const json = await invoke<string>('get_native_messaging_manifest', { browser });
      setManifestPath(path);
      setManifest(json);
    } catch (e) {
      console.error('Failed to fetch manifest:', e);
    }
  };

  const copyManifest = async () => {
    try {
      await navigator.clipboard.writeText(manifest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const runAutoSetup = async () => {
    setSettingUp(true);
    setResults(null);
    try {
      const res = await invoke<BrowserSetupResult[]>('setup_browser_extension');
      setResults(res);
    } catch (e: any) {
      setResults([{ browser: '', name: 'Error', native_messaging: false, extension_loaded: false, message: String(e) }]);
    } finally {
      setSettingUp(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="w-5 h-5 text-blue-400" />
        <h3 className="text-xl font-bold text-white tracking-tight">Browser Integration</h3>
      </div>
      <p className="text-sm text-zinc-400">Install the browser extension to capture downloads and send them directly to ZenDownload.</p>

      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-300 mt-0.5">
            <Zap className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white mb-1">One-Click Setup</div>
            <p className="text-xs text-zinc-400 mb-3">
              Automatically detect your installed browsers, register the native messaging host, and load the extension.
            </p>
            <Button onClick={runAutoSetup} disabled={settingUp} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              {settingUp ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              {settingUp ? 'Setting up...' : 'Auto-Setup Browser Extension'}
            </Button>
          </div>
        </div>
      </div>

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`p-3 rounded-xl border text-sm ${
              r.extension_loaded
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : r.native_messaging
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4" />
                <span className="font-semibold">{r.name}</span>
                {r.extension_loaded && <span className="ml-auto text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full">Extension loaded</span>}
                {r.native_messaging && !r.extension_loaded && <span className="ml-auto text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full">Host registered</span>}
              </div>
              <p className="text-xs opacity-80">{r.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 max-w-2xl">
        <BrowserCard
          icon={<Globe className="w-5 h-5" />}
          name="Chrome / Edge / Brave"
          desc="Show native messaging manifest"
          onClick={() => fetchManifest('chrome')}
        />
        <BrowserCard
          icon={<Globe className="w-5 h-5" />}
          name="Firefox"
          desc="Show native messaging manifest"
          onClick={() => fetchManifest('firefox')}
        />
      </div>

      <div className="bg-zinc-900/30 border border-white/[0.06] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Package className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold">Native Messaging Host</span>
        </div>
        <p className="text-xs text-zinc-500">
          Required for the extension to communicate with ZenDownload. Install by copying the manifest to the path shown.
        </p>
        {manifestPath && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Manifest Path</div>
            <div className="font-mono text-xs text-zinc-300 bg-zinc-950 p-2 rounded border border-white/[0.04] break-all">{manifestPath}</div>
          </div>
        )}
        {manifest && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Manifest Contents</div>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyManifest}
                className="h-6 text-xs text-zinc-500 hover:text-white"
              >
                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="font-mono text-[10px] text-zinc-300 bg-zinc-950 p-2 rounded border border-white/[0.04] overflow-x-auto max-h-32">
{manifest}
            </pre>
          </div>
        )}
        <div className="text-xs text-zinc-500 flex items-start gap-1.5">
          <MousePointerClick className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Right-click any link in your browser and select "Download with ZenDownload" to send it to the app.</span>
        </div>
      </div>
    </div>
  );
}

function BrowserCard({ icon, name, desc, onClick }: { icon: React.ReactNode; name: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 bg-zinc-900/30 border border-white/[0.06] rounded-xl hover:bg-zinc-800/40 hover:border-white/10 transition-all text-left"
    >
      <div className="p-2 bg-zinc-800/50 rounded-lg text-zinc-300">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-white">{name}</div>
        <div className="text-xs text-zinc-500">{desc}</div>
      </div>
    </button>
  );
}
