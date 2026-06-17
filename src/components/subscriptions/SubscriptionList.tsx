import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, PlaySquare, Rss, Trash2, ExternalLink, RefreshCw, Play, Filter, Download, Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Subscription {
  id: number;
  name: string | null;
  url: string;
  sub_type: 'rss' | 'youtube' | 'rsshub';
  enabled: number;
  interval_minutes: number;
  include_keywords: string | null;
  exclude_keywords: string | null;
  category: string | null;
  last_checked: string | null;
  last_error: string | null;
}

const defaultForm = {
  name: '',
  url: '',
  sub_type: 'rss' as 'rss' | 'youtube' | 'rsshub',
  interval_minutes: '60',
  include_keywords: '',
  exclude_keywords: '',
  category: 'General',
};

export function SubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'rss' | 'rsshub' | 'youtube' | 'enabled' | 'disabled'>('all');
  const [showRsshub, setShowRsshub] = useState(false);
  const [rsshubRoutes, setRsshubRoutes] = useState<any[]>([]);
  const [rsshubLoading, setRsshubLoading] = useState(false);
  const [rsshubQuery, setRsshubQuery] = useState('');
  const [rsshubUrl, setRsshubUrl] = useState('https://rsshub.app');

  const fetchSubscriptions = async () => {
    try {
      const subs = await invoke<Subscription[]>('get_subscriptions');
      setSubscriptions(subs);
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      if (filter === 'enabled') return sub.enabled === 1;
      if (filter === 'disabled') return sub.enabled === 0;
      if (filter === 'rss' || filter === 'rsshub') return sub.sub_type === 'rss' || sub.sub_type === 'rsshub';
      if (filter === 'youtube') return sub.sub_type === 'youtube';
      return true;
    });
  }, [subscriptions, filter]);

  const resetForm = () => setForm(defaultForm);

  const handleAdd = async () => {
    if (!form.url.trim()) return;
    setIsLoading(true);
    try {
      await invoke('add_subscription', {
        sub: {
          name: form.name.trim() || null,
          url: form.url.trim(),
          sub_type: form.sub_type,
          enabled: true,
          interval_minutes: parseInt(form.interval_minutes || '60', 10),
          include_keywords: form.include_keywords.trim() || null,
          exclude_keywords: form.exclude_keywords.trim() || null,
          category: form.category,
        },
      });
      resetForm();
      await fetchSubscriptions();
    } catch (err) {
      console.error('Failed to add subscription:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await invoke('delete_subscription', { id });
      await fetchSubscriptions();
    } catch (err) {
      console.error('Failed to delete subscription:', err);
    }
  };

  const handleRunNow = async (id: number) => {
    try {
      await invoke('run_subscription_now', { id });
      await fetchSubscriptions();
    } catch (err) {
      console.error('Failed to run subscription:', err);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await invoke('set_subscription_enabled', { id, enabled });
      await fetchSubscriptions();
    } catch (err) {
      console.error('Failed to toggle subscription:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Subscriptions</h2>
          <p className="text-zinc-500 text-sm mt-1">Auto-download RSS feeds and YouTube channels with per-source rules.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" className="h-9 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg border border-indigo-500/20 text-[13px] gap-2"
            onClick={async () => { setShowRsshub(true); setRsshubLoading(true);
              try { const routes = await invoke<any[]>('discover_rsshub_routes', { rsshubUrl: rsshubUrl || null });
                setRsshubRoutes(routes); } catch { setRsshubRoutes([]); }
              setRsshubLoading(false); }}>
            <Rss className="w-4 h-4" />Browse RSSHub Routes
          </Button>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[150px] h-9 bg-zinc-900/50 border-white/[0.08] text-white rounded-lg text-[13px]">
              <Filter className="w-4 h-4 mr-2 text-zinc-500" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="rss">RSS</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="bg-zinc-900/40 border-white/[0.06] p-4 rounded-2xl mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Subscription name" className="bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg" />
          <Input value={form.url} onChange={(e) => setForm(prev => ({ ...prev, url: e.target.value }))} placeholder="RSS or YouTube URL" className="bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg" />
          <Select value={form.sub_type} onValueChange={(v) => setForm(prev => ({ ...prev, sub_type: v as 'rss' | 'youtube' | 'rsshub' }))}>
            <SelectTrigger className="bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg text-[13px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              <SelectItem value="rss">RSS</SelectItem>
              <SelectItem value="rsshub">RSSHub</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
            </SelectContent>
          </Select>
          <Input value={form.interval_minutes} onChange={(e) => setForm(prev => ({ ...prev, interval_minutes: e.target.value }))} type="number" min="5" placeholder="Interval minutes" className="bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg" />
          <Input value={form.include_keywords} onChange={(e) => setForm(prev => ({ ...prev, include_keywords: e.target.value }))} placeholder="Include keywords (comma-separated)" className="bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg" />
          <Input value={form.exclude_keywords} onChange={(e) => setForm(prev => ({ ...prev, exclude_keywords: e.target.value }))} placeholder="Exclude keywords (comma-separated)" className="bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg" />
          <Select value={form.category} onValueChange={(v) => setForm(prev => ({ ...prev, category: v || 'General' }))}>
            <SelectTrigger className="bg-zinc-900/50 border-white/[0.08] text-white h-10 rounded-lg text-[13px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              <SelectItem value="General">General</SelectItem>
              <SelectItem value="Video">Video</SelectItem>
              <SelectItem value="Music">Music</SelectItem>
              <SelectItem value="Documents">Documents</SelectItem>
              <SelectItem value="Compressed">Compressed</SelectItem>
              <SelectItem value="Programs">Programs</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 md:col-span-2 lg:col-span-1">
            <Button onClick={handleAdd} disabled={isLoading} className="h-10 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg gap-2">
              <Plus className="w-4 h-4" />
              Subscribe
            </Button>
            <Button variant="secondary" className="h-10 px-4 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 rounded-lg border border-white/[0.06]" onClick={resetForm}>
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-2">
        {filteredSubscriptions.length === 0 ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <Rss className="w-8 h-8 text-zinc-600" />
            </div>
            <h3 className="text-zinc-300 font-medium">No subscriptions yet</h3>
            <p className="text-zinc-600 text-sm mt-1 max-w-[320px]">Add a YouTube channel or RSS feed, set filters, and the app will keep pulling new items automatically.</p>
          </div>
        ) : filteredSubscriptions.map((sub) => (
          <Card key={sub.id} className="bg-zinc-900/40 border-white/[0.06] p-4 rounded-2xl hover:border-white/[0.12] transition-all group">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  {sub.sub_type === 'youtube' ? <PlaySquare className="w-5 h-5 text-red-500" /> : sub.sub_type === 'rsshub' ? <Globe className="w-5 h-5 text-orange-400" /> : <Rss className="w-5 h-5 text-orange-500" />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-zinc-200 truncate pr-2">{sub.name || sub.url}</h4>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="bg-white/[0.06] text-zinc-400 text-[10px] font-bold uppercase tracking-wider border-none">
                      {sub.sub_type}
                    </Badge>
                    <Badge variant="outline" className={`${sub.enabled === 1 ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' : 'border-zinc-600/20 text-zinc-500 bg-zinc-800/40'} text-[10px] font-bold uppercase tracking-wider`}>
                      {sub.enabled === 1 ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <span className="text-[11px] text-zinc-600 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {sub.interval_minutes}m
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white" onClick={() => window.open(sub.url, '_blank')}>
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10" onClick={() => handleRunNow(sub.id)}>
                  <Download className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-400/10" onClick={() => handleDelete(sub.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <p className="text-[11px] text-zinc-500 truncate">{sub.url}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                <span className="truncate">Include: {sub.include_keywords || 'Any'}</span>
                <span className="truncate">Exclude: {sub.exclude_keywords || 'None'}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span>Category: {sub.category || 'General'}</span>
                <span>{sub.last_checked ? new Date(sub.last_checked).toLocaleString() : 'Never checked'}</span>
              </div>
              {sub.last_error && <div className="text-[11px] text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded-lg p-2">{sub.last_error}</div>}
            </div>

            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[11px] text-zinc-500 cursor-pointer">
                <Checkbox checked={sub.enabled === 1} onCheckedChange={(checked) => handleToggle(sub.id, !!checked)} />
                Auto download
              </label>
              <Button variant="ghost" size="sm" className="h-8 px-3 text-[12px] text-zinc-400 hover:text-white hover:bg-white/[0.04]" onClick={() => handleRunNow(sub.id)}>
                <Play className="w-3.5 h-3.5 mr-1.5" />
                Run now
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* RSSHub Route Browser Modal */}
      <Dialog open={showRsshub} onOpenChange={setShowRsshub}>
        <DialogContent className="max-w-3xl max-h-[85vh] bg-zinc-950 border-zinc-800 text-white overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Globe className="w-5 h-5 text-orange-400" />
              RSSHub Route Browser
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-3">
            <Input value={rsshubUrl} onChange={e => setRsshubUrl(e.target.value)}
              placeholder="RSSHub instance URL" className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-9 rounded-lg text-sm" />
            <Input value={rsshubQuery} onChange={e => setRsshubQuery(e.target.value)}
              placeholder="Search routes..." className="flex-1 bg-zinc-900/50 border-white/[0.08] text-white h-9 rounded-lg text-sm" />
            <Button variant="secondary" size="sm" onClick={async () => { setRsshubLoading(true);
              try { const routes = await invoke<any[]>('discover_rsshub_routes', { rsshubUrl: rsshubUrl || null });
                setRsshubRoutes(routes); } catch { setRsshubRoutes([]); }
              setRsshubLoading(false); }} className="h-9 px-3 bg-white/10 hover:bg-white/20 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {rsshubLoading ? (
              <div className="text-center py-12 text-zinc-500">Loading routes from {rsshubUrl}...</div>
            ) : rsshubRoutes.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Globe className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">No routes loaded</p>
                <p className="text-xs text-zinc-600 mt-1">Make sure your RSSHub instance is running at {rsshubUrl}</p>
              </div>
            ) : (
              rsshubRoutes
                .filter((r: any) => !rsshubQuery || r.name.toLowerCase().includes(rsshubQuery.toLowerCase()) || (r.description || '').toLowerCase().includes(rsshubQuery.toLowerCase()))
                .slice(0, 200)
                .map((route: any) => {
                  const sampleRoute = Array.isArray(route.routes) ? route.routes[0]?.path || '' : '';
                  const rsshubRouteUrl = rsshubUrl.replace(/\/$/, '') + sampleRoute;
                  return (
                    <div key={route.name} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200 truncate">{route.name}</span>
                          {sampleRoute && <code className="text-[11px] text-zinc-500 font-mono truncate hidden sm:inline">{sampleRoute}</code>}
                        </div>
                        {route.description && <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{route.description}</p>}
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0 h-8 px-3 text-[12px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                        onClick={() => {
                          navigator.clipboard.writeText(rsshubRouteUrl);
                          setForm(prev => ({ ...prev, url: rsshubRouteUrl, sub_type: 'rsshub', name: route.name }));
                          setShowRsshub(false);
                        }}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                    </div>
                  );
                })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
