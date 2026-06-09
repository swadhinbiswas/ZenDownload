import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Globe, Copy, Check, Package, MousePointerClick } from 'lucide-react';

export function BrowserExtensionSection() {
  const [manifestPath, setManifestPath] = useState<string>('');
  const [manifest, setManifest] = useState<string>('');
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="w-5 h-5 text-blue-400" />
        <h3 className="text-xl font-bold text-white tracking-tight">Browser Integration</h3>
      </div>
      <p className="text-sm text-zinc-400">Install the browser extension to capture downloads and send them directly to ZenDownload.</p>

      <div className="grid grid-cols-2 gap-3 max-w-2xl">
        <BrowserCard
          icon={<Globe className="w-5 h-5" />}
          name="Chrome / Edge / Brave"
          desc="Install via Chrome Web Store"
          onClick={() => fetchManifest('chrome')}
        />
        <BrowserCard
          icon={<Globe className="w-5 h-5" />}
          name="Firefox"
          desc="Install via Mozilla Add-ons"
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
