import { useEffect } from 'react';
import { useFeedStore } from '../../stores/feedStore';
import { Bell, CheckCircle, AlertCircle, Download, Puzzle, Info } from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  'check-circle': <CheckCircle className="w-4 h-4 text-emerald-400" />,
  'alert-circle': <AlertCircle className="w-4 h-4 text-red-400" />,
  'download': <Download className="w-4 h-4 text-blue-400" />,
  'puzzle': <Puzzle className="w-4 h-4 text-purple-400" />,
  'info': <Info className="w-4 h-4 text-cyan-400" />,
};

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export function FeedPage() {
  const events = useFeedStore(state => state.events);
  const unread = useFeedStore(state => state.unread);
  const markAllRead = useFeedStore(state => state.markAllRead);

  useEffect(() => {
    markAllRead();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-semibold text-white tracking-tight">Activity Feed</h1>
          {unread > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{unread} new</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto py-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-zinc-500">
              <Bell className="w-12 h-12 text-zinc-700 mb-4" />
              <p className="text-sm font-medium text-zinc-400">No activity yet</p>
              <p className="text-xs text-zinc-600 mt-1">Events from downloads and plugins will show here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-6 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center mt-0.5">
                    {ICON_MAP[event.icon] || <Bell className="w-4 h-4 text-zinc-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-zinc-200 truncate">{event.title}</span>
                      <span className="text-[10px] text-zinc-600 shrink-0">{formatTime(event.timestamp)}</span>
                    </div>
                    <p className="text-[12px] text-zinc-500 truncate mt-0.5">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
