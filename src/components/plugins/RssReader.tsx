import { useState, useEffect } from 'react';
import { Rss, ExternalLink, RefreshCw, Clock } from 'lucide-react';

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

export function RssReader({ pageConfig }: { pageConfig?: any }) {
  const [feedUrl, setFeedUrl] = useState(pageConfig?.feed_url || '');
  const [items, setItems] = useState<RssItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const feeds = pageConfig?.feeds || (feedUrl ? [{ url: feedUrl, name: pageConfig?.name || 'Feed' }] : [
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', name: 'NYT World' },
    { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC News' },
  ]);

  const fetchFeed = async (url: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      const parser = new DOMParser();
      const xml = parser.parseFromString(data.contents, 'text/xml');
      const entries = xml.querySelectorAll('item');
      const parsed: RssItem[] = Array.from(entries).map(item => ({
        title: item.querySelector('title')?.textContent || '',
        link: item.querySelector('link')?.textContent || '',
        pubDate: item.querySelector('pubDate')?.textContent || '',
        description: (item.querySelector('description')?.textContent || '').replace(/<[^>]*>/g, '').slice(0, 200),
      }));
      setItems(parsed);
    } catch {
      setError('Failed to fetch RSS feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!feedUrl && !pageConfig?.feeds) fetchFeed(feeds[0].url); }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.04] shrink-0">
        <Rss className="w-4 h-4 text-orange-400" />
        <h1 className="text-[13px] font-medium text-white">{pageConfig?.name || 'RSS Reader'}</h1>
        {feedUrl && (
          <div className="flex items-center gap-2 ml-auto">
            <input
              value={feedUrl}
              onChange={e => setFeedUrl(e.target.value)}
              placeholder="Enter RSS feed URL..."
              className="w-64 h-8 px-3 rounded-lg bg-zinc-900/50 border border-white/[0.06] text-[12px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
            <button onClick={() => fetchFeed(feedUrl)} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <p className="text-red-400 text-[12px] mb-3">{error}</p>}
        <div className="grid grid-cols-1 gap-2 max-w-3xl">
          {loading ? (
            <div className="text-center text-zinc-500 py-20 text-[13px]">Loading feeds...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-zinc-500 py-20 text-[13px]">No items</div>
          ) : items.map((item, i) => (
            <div key={i} className="px-4 py-3 rounded-xl bg-zinc-900/30 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-200 truncate">{item.title}</p>
                  <p className="text-[12px] text-zinc-500 mt-1 line-clamp-2">{item.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {item.pubDate && (
                      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(item.pubDate).toLocaleDateString()}
                      </span>
                    )}
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">
                      <ExternalLink className="w-2.5 h-2.5" /> Open
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
