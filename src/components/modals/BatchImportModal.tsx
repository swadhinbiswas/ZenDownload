import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Upload, FileText, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BatchImportModal({ isOpen, onClose }: BatchImportModalProps) {
  const [urls, setUrls] = useState('');
  const [category, setCategory] = useState('General');
  const [threads, setThreads] = useState(4);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parseUrls = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('magnet:')));
  };

  const handleImport = async () => {
    const parsedUrls = parseUrls(urls);
    if (parsedUrls.length === 0) return;

    setIsImporting(true);
    setResults(null);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const savePath = await invoke<string>('get_default_save_path').catch(() => '~/Downloads');

    for (const url of parsedUrls) {
      try {
        await invoke('add_download', {
          url,
          savePath,
          threads,
          category: category === 'General' ? null : category,
          extraMeta: null,
        });
        success++;
      } catch (e: any) {
        failed++;
        errors.push(`${url}: ${e?.message || String(e)}`);
      }
    }

    setResults({ success, failed, errors });
    setIsImporting(false);
  };

  const handleFileUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.text,.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      setUrls(prev => prev ? prev + '\n' + text : text);
    };
    input.click();
  };

  const urlCount = parseUrls(urls).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-zinc-950 border-white/[0.08]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Upload className="w-5 h-5 text-indigo-400" />
            Batch Import URLs
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-zinc-400">Paste URLs (one per line)</label>
              <button
                onClick={handleFileUpload}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <FileText className="w-3 h-3" />
                Import from file
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={'https://example.com/file.zip\nhttps://example.com/video.mp4\nmagnet:?xt=...'}
              className="w-full h-40 bg-zinc-900/50 border border-white/[0.06] rounded-lg p-3 text-sm text-zinc-200 font-mono resize-none focus:outline-none focus:border-indigo-500/50 placeholder:text-zinc-600"
            />
            {urlCount > 0 && (
              <p className="text-xs text-zinc-500 mt-1">{urlCount} URL{urlCount !== 1 ? 's' : ''} detected</p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 mb-1 block">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-zinc-900/50 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
              >
                <option value="General">General</option>
                <option value="Video">Video</option>
                <option value="Music">Music</option>
                <option value="Documents">Documents</option>
                <option value="Programs">Programs</option>
                <option value="Compressed">Compressed</option>
              </select>
            </div>
            <div className="w-24">
              <label className="text-xs text-zinc-500 mb-1 block">Threads</label>
              <input
                type="number"
                value={threads}
                onChange={(e) => setThreads(Math.max(1, Math.min(64, parseInt(e.target.value) || 4)))}
                min={1}
                max={64}
                className="w-full bg-zinc-900/50 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
          </div>

          {results && (
            <div className={`p-3 rounded-lg text-sm ${results.failed > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
              <p className={results.failed > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                {results.success} imported{results.failed > 0 ? `, ${results.failed} failed` : ''}
              </p>
              {results.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {results.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-xs text-zinc-500 font-mono truncate">{err}</p>
                  ))}
                  {results.errors.length > 5 && (
                    <p className="text-xs text-zinc-600">...and {results.errors.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {results ? 'Close' : 'Cancel'}
            </button>
            {!results && (
              <button
                onClick={handleImport}
                disabled={urlCount === 0 || isImporting}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                {isImporting ? 'Importing...' : `Import ${urlCount} URL${urlCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
