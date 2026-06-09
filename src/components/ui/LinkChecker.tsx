import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, CheckCircle, AlertCircle, Shield, HardDrive, Clock, Loader2, ExternalLink } from 'lucide-react';

interface LinkCheckResult {
  url: string;
  alive: boolean;
  status_code: number;
  file_size: number | null;
  file_size_human: string | null;
  content_type: string | null;
  file_extension: string | null;
  requires_auth: boolean;
  has_rate_limit: boolean;
  disk_space_available: number;
  disk_space_sufficient: boolean;
  estimated_time: string | null;
  warnings: string[];
  redirect_url: string | null;
}

interface LinkCheckerProps {
  url: string;
  onResult?: (result: LinkCheckResult) => void;
}

export function LinkChecker({ url, onResult }: LinkCheckerProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<LinkCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!url.trim()) return;
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const res = await invoke<LinkCheckResult>('check_link', { url: url.trim() });
      setResult(res);
      onResult?.(res);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleCheck}
        disabled={!url.trim() || checking}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
      >
        {checking ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Search className="w-3.5 h-3.5" />
        )}
        {checking ? 'Checking link...' : 'Check link before downloading'}
      </button>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className={`px-3 py-2.5 rounded-lg border text-xs ${
          result.alive
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-red-500/5 border-red-500/20'
        }`}>
          <div className="flex items-center gap-2 mb-1.5">
            {result.alive ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            )}
            <span className={`font-medium ${result.alive ? 'text-emerald-300' : 'text-red-300'}`}>
              {result.alive ? 'Link is alive' : 'Link is not available'}
            </span>
            <span className="text-zinc-600">({result.status_code})</span>
          </div>

          <div className="space-y-1 text-zinc-400">
            {result.file_size_human && (
              <div className="flex items-center gap-1.5">
                <HardDrive className="w-3 h-3 text-zinc-600" />
                <span>Size: {result.file_size_human}</span>
                {!result.disk_space_sufficient && (
                  <span className="text-red-400 text-[10px]">⚠ Not enough disk space</span>
                )}
              </div>
            )}
            {result.content_type && (
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">Type:</span>
                <span>{result.content_type}</span>
              </div>
            )}
            {result.file_extension && (
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">Format:</span>
                <span className="uppercase font-mono">.{result.file_extension}</span>
              </div>
            )}
            {result.estimated_time && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-zinc-600" />
                <span>Est. download: {result.estimated_time}</span>
              </div>
            )}
            {result.requires_auth && (
              <div className="flex items-center gap-1.5 text-amber-400">
                <Shield className="w-3 h-3" />
                <span>Requires authentication</span>
              </div>
            )}
            {result.redirect_url && (
              <div className="flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3 text-zinc-600" />
                <span className="truncate">Redirects to: {result.redirect_url}</span>
              </div>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-1">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-amber-400/80">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
