import { Activity, Users, ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface TorrentPeerStats {
    active_peers: number;
    total_peers: number;
    down_speed: number;
    up_speed: number;
    progress: number;
}

export function TorrentPeerMap({ stats }: { stats?: TorrentPeerStats }) {
    if (!stats) return null;

    function formatSpeed(bytes: number) {
        if (bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    return (
        <Card className="w-full bg-slate-900 text-white border-none shadow-xl mt-4">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-400">
                    <Activity size={18} />
                    BitTorrent Swarm Overlay
                </CardTitle>
                <div className="flex bg-slate-800 rounded-lg p-1.5 px-3 text-xs font-mono items-center gap-2">
                    <Users size={14} className="text-zinc-400"/>
                    <span className="text-green-400 font-bold">{stats.active_peers}</span>
                    <span className="text-zinc-500">/</span>
                    <span className="text-zinc-300">{stats.total_peers}</span>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="bg-slate-800 rounded border border-slate-700 p-3 flex flex-col items-center">
                        <ArrowDown size={18} className="text-emerald-400 mb-1" />
                        <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Down</span>
                        <span className="font-mono mt-1 text-lg">{formatSpeed(stats.down_speed)}</span>
                    </div>
                    <div className="bg-slate-800 rounded border border-slate-700 p-3 flex flex-col items-center">
                        <ArrowUp size={18} className="text-rose-400 mb-1" />
                        <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Up</span>
                        <span className="font-mono mt-1 text-lg">{formatSpeed(stats.up_speed)}</span>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-slate-400 font-bold tracking-wide">COMPLETION</span>
                        <span className="text-xs font-mono font-bold text-blue-400">{stats.progress.toFixed(1)}%</span>
                    </div>
                    <div className="relative h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${stats.progress}%` }} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
