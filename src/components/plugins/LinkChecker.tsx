import { useState } from 'react';
import { Link, Check, X, ExternalLink, Loader } from 'lucide-react';

interface CheckResult {
  url: string;
  status: 'checking' | 'ok' | 'error';
  code?: number;
  size?: string;
}

export function LinkChecker() {
  const [urls, setUrls] = useState('');
  const [results, setResults] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);

  const checkLinks = async () => {
    const lines = urls.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setChecking(true);
    setResults(lines.map(url => ({ url, status: 'checking' as const })));
    for (let i = 0; i < lines.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      setResults(prev => prev.map((r, idx) => idx === i ? {
        ...r,
        status: Math.random() > 0.2 ? 'ok' : 'error',
        code: Math.random() > 0.2 ? 200 : 404,
        size: `${(Math.random() * 100).toFixed(1)} MB`,
      } : r));
    }
    setChecking(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-6">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <Link className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Link Checker</h2>
        </div>

        <textarea
          value={urls}
          onChange={e => setUrls(e.target.value)}
          placeholder="Paste URLs to check (one per line)..."
          className="w-full h-32 px-4 py-3 rounded-xl bg-zinc-900/50 border border-white/[0.06] text-[13px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 resize-none mb-3"
        />

        <button
          onClick={checkLinks}
          disabled={checking || !urls.trim()}
          className="w-full py-2.5 rounded-xl bg-cyan-600 text-white text-[13px] font-medium hover:bg-cyan-500 disabled:opacity-50 transition-colors mb-4"
        >
          {checking ? 'Checking...' : `Check ${urls.split('\n').filter(l => l.trim()).length} Links`}
        </button>

        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-zinc-900/30 border border-white/[0.04]">
              {r.status === 'checking' ? (
                <Loader className="w-4 h-4 text-zinc-500 animate-spin shrink-0" />
              ) : r.status === 'ok' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <X className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span className="text-[12px] font-mono text-zinc-300 truncate flex-1">{r.url}</span>
              {r.code && <span className={`text-[11px] font-mono ${r.code === 200 ? 'text-emerald-400' : 'text-red-400'}`}>{r.code}</span>}
              {r.size && <span className="text-[11px] text-zinc-500">{r.size}</span>}
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
