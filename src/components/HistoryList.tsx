import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FolderOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { formatDistanceToNow } from 'date-fns';

interface HistoryItem {
  id: string;
  download_id: string | null;
  file_name: string | null;
  save_path: string | null;
  url: string | null;
  total_size: number | null;
  completed_at: string | null;
  category: string | null;
}

export function HistoryList() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await invoke<HistoryItem[]>('get_history');
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Archive</h2>
          <p className="text-zinc-500 text-sm mt-1">Completed downloads are kept here for quick reopening.</p>
        </div>
        <Button onClick={loadHistory} className="bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.06]">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map(item => (
          <Card key={item.id} className="bg-zinc-900/40 border-white/[0.06] p-4 rounded-2xl hover:border-white/[0.12] transition-all">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-zinc-200 truncate">{item.file_name || 'Untitled'}</h4>
                <p className="text-[11px] text-zinc-500 truncate">{item.url}</p>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                {item.category || 'General'}
              </span>
            </div>

            <div className="text-[11px] text-zinc-500 space-y-1 mb-4">
              <div>Completed {(() => {
                if (!item.completed_at) return 'recently';
                const d = new Date(item.completed_at);
                return !isNaN(d.getTime()) ? formatDistanceToNow(d, { addSuffix: true }) : 'recently';
              })()}</div>
              <div>Size: {item.total_size ? `${(item.total_size / (1024 * 1024)).toFixed(1)} MB` : 'Unknown'}</div>
              <div className="truncate">Path: {item.save_path}</div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.06]" onClick={async () => item.save_path && openPath(item.save_path)}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Open
              </Button>
              <Button variant="secondary" className="bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.06]" onClick={async () => item.save_path && revealItemInDir(item.save_path)}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {items.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-zinc-500">
          <p>No completed downloads yet.</p>
        </div>
      )}
    </div>
  );
}
