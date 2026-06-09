import { useState } from 'react';
import { Search, Download, ArrowUpDown, Magnet } from 'lucide-react';

interface TorrentResult {
  name: string;
  size: string;
  seeds: number;
  peers: number;
  magnet: string;
  category: string;
  uploaded: string;
}

const DEMO_RESULTS: TorrentResult[] = [
  { name: 'Ubuntu 24.04 LTS Desktop', size: '4.1 GB', seeds: 1250, peers: 34, magnet: '#', category: 'Linux', uploaded: '2 days ago' },
  { name: 'Blender 4.0 Tutorial Pack', size: '2.3 GB', seeds: 890, peers: 21, magnet: '#', category: 'Education', uploaded: '1 week ago' },
  { name: 'GIMP 2.10 Documentation', size: '156 MB', seeds: 340, peers: 12, magnet: '#', category: 'Books', uploaded: '3 days ago' },
  { name: 'Python Crash Course (3rd Ed)', size: '8.2 MB', seeds: 5600, peers: 120, magnet: '#', category: 'Books', uploaded: '1 month ago' },
  { name: 'VS Code Extensions Pack', size: '45 MB', seeds: 2100, peers: 45, magnet: '#', category: 'Software', uploaded: '5 days ago' },
];

export function TorrentSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sortBy, setSortBy] = useState<'seeds' | 'size' | 'date'>('seeds');

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    await new Promise(r => setTimeout(r, 800));
    setResults(DEMO_RESULTS.filter(r =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.category.toLowerCase().includes(query.toLowerCase())
    ));
    setSearching(false);
  };

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'seeds') return b.seeds - a.seeds;
    return 0;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden p-6">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <Magnet className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-white">Torrent Search</h2>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="Search for torrents..."
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-zinc-900/50 border border-white/[0.06] text-[13px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>
          <button
            onClick={search}
            disabled={searching}
            className="px-5 py-2 rounded-xl bg-orange-600 text-white text-[13px] font-medium hover:bg-orange-500 disabled:opacity-50 transition-colors"
          >
            {searching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Search'}
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setSortBy('seeds')} className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${sortBy === 'seeds' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-300'}`}>
            <ArrowUpDown className="w-3 h-3 inline mr-1" /> Seeds
          </button>
        </div>

        <div className="space-y-2">
          {sorted.map((r, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-zinc-900/30 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-zinc-200 truncate">{r.name}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-800 text-zinc-500">{r.category}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                  <span>{r.size}</span>
                  <span className="text-emerald-400">↑{r.seeds.toLocaleString()}</span>
                  <span className="text-red-400">↓{r.peers}</span>
                  <span>{r.uploaded}</span>
                </div>
              </div>
              <button className="px-3 py-1.5 rounded-lg bg-orange-600/10 text-orange-400 text-[11px] font-medium hover:bg-orange-600/20 transition-colors flex items-center gap-1">
                <Download className="w-3 h-3" /> Get
              </button>
            </div>
          ))}
          {results.length === 0 && !searching && (
            <div className="text-center py-16 text-zinc-600">
              <Magnet className="w-12 h-12 mx-auto mb-3" />
              <p className="text-sm">Search for torrents to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
