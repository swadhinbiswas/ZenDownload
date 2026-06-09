import { useState, useEffect, useCallback } from 'react';
import { Store, Download, Search, ArrowLeft, ExternalLink, Puzzle, Globe, Bell, ArrowRightLeft, Film, HardDrive, Music, Tv, Radio, Rss, Zap, Headphones, Link, Clock, FileText, Shield, Wifi, Palette, Calculator, Timer, Hash, Check, RefreshCw, AlertCircle } from 'lucide-react';
import type { CatalogPlugin, PluginCategory } from '../../types/plugin';
import { PLUGIN_CATEGORY_META, PLUGIN_TYPE_META } from '../../types/plugin';
import { pluginService } from '../../services/pluginService';

const ICON_MAP: Record<string, React.ReactNode> = {
  Film: <Film className="w-3.5 h-3.5" />,
  HardDrive: <HardDrive className="w-3.5 h-3.5" />,
  Globe: <Globe className="w-3.5 h-3.5" />,
  Bell: <Bell className="w-3.5 h-3.5" />,
  ArrowRightLeft: <ArrowRightLeft className="w-3.5 h-3.5" />,
  Puzzle: <Puzzle className="w-3.5 h-3.5" />,
  Music: <Music className="w-3.5 h-3.5" />,
  Tv: <Tv className="w-3.5 h-3.5" />,
  Radio: <Radio className="w-3.5 h-3.5" />,
  Rss: <Rss className="w-3.5 h-3.5" />,
  Zap: <Zap className="w-3.5 h-3.5" />,
  Headphones: <Headphones className="w-3.5 h-3.5" />,
  Link: <Link className="w-3.5 h-3.5" />,
  Clock: <Clock className="w-3.5 h-3.5" />,
  FileText: <FileText className="w-3.5 h-3.5" />,
  Shield: <Shield className="w-3.5 h-3.5" />,
  Wifi: <Wifi className="w-3.5 h-3.5" />,
  Palette: <Palette className="w-3.5 h-3.5" />,
  Calculator: <Calculator className="w-3.5 h-3.5" />,
  Timer: <Timer className="w-3.5 h-3.5" />,
  Hash: <Hash className="w-3.5 h-3.5" />,
  Search: <Search className="w-3.5 h-3.5" />,
  List: <FileText className="w-3.5 h-3.5" />,
};

const ALL_CATEGORIES: PluginCategory[] = ['media', 'productivity', 'downloader', 'notification', 'utility', 'fun'];

export function PluginStorePage({ onBack }: { onBack?: () => void }) {
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<PluginCategory | 'all'>('all');
  const [installing, setInstalling] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<CatalogPlugin | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await pluginService.fetchCatalog();
      setCatalog(data);
    } catch (e: any) {
      setError(`Failed to load catalog: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInstalled = useCallback(async () => {
    try {
      const plugins = await pluginService.list();
      setInstalledIds(new Set(plugins.map(p => p.id)));
    } catch {}
  }, []);

  useEffect(() => { loadCatalog(); loadInstalled(); }, [loadCatalog, loadInstalled]);

  const filtered = catalog.filter(p => {
    const matchesSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.author.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const installPlugin = async (plugin: CatalogPlugin) => {
    setInstalling(plugin.id);
    setMessage('');
    try {
      await pluginService.install({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        author: plugin.author,
        description: plugin.description,
        homepage: plugin.homepage || null,
        plugin_type: plugin.plugin_type,
        enabled: true,
        config: {},
        hooks: plugin.hooks,
        ui: plugin.ui ? { sidebar_label: plugin.ui.sidebar_label, sidebar_icon: plugin.ui.sidebar_icon, component_type: plugin.ui.component_type, page_config: plugin.ui.page_config || {}, asset_dir: null } : null,
        icon: plugin.icon,
        category: plugin.category,
        tags: plugin.tags,
        config_schema: plugin.config_schema || [],
        downloads: plugin.downloads,
        screenshots: [],
        min_version: null,
        installed_at: 0,
        path: null,
      });
      setInstalledIds(prev => new Set([...prev, plugin.id]));
      setMessage(`${plugin.name} installed successfully!`);
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage(`Failed: ${e}`);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Store className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-semibold text-white tracking-tight">Plugin Store</h1>
          {!loading && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-white/[0.06]">{catalog.length} plugins</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadCatalog} disabled={loading} className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-300 disabled:opacity-50 transition-colors" title="Refresh catalog">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search plugins..."
              className="w-64 h-9 pl-9 pr-3 rounded-lg bg-zinc-900/50 border border-white/[0.06] text-[13px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 px-3 py-2 bg-red-500/10 text-red-300 text-[12px] rounded-lg border border-red-500/20 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {message && (
        <div className="mx-6 mt-3 px-3 py-2 bg-emerald-500/10 text-emerald-300 text-[12px] rounded-lg border border-emerald-500/20">{message}</div>
      )}

      <div className="flex gap-1 px-6 pt-3 shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
            activeCategory === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          All
        </button>
        {ALL_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
              activeCategory === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {PLUGIN_CATEGORY_META[cat].icon} {PLUGIN_CATEGORY_META[cat].label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto py-4 px-6">
          {loading ? (
            <div className="text-center text-zinc-500 py-20 text-[13px]">Loading catalog...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-zinc-500 py-20 text-[13px]">
              {catalog.length === 0 ? 'No plugins available. Check your connection.' : 'No plugins match your search'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filtered.map(plugin => {
                const isInstalled = installedIds.has(plugin.id);
                return (
                  <div
                    key={plugin.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl bg-zinc-900/30 border border-white/[0.04] hover:border-white/[0.08] transition-colors cursor-pointer group"
                    onClick={() => setSelectedPlugin(selectedPlugin?.id === plugin.id ? null : plugin)}
                  >
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-lg">
                      {plugin.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-zinc-200">{plugin.name}</span>
                        <span className="text-[10px] text-zinc-600 font-mono">v{plugin.version}</span>
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${PLUGIN_TYPE_META[plugin.plugin_type]?.color || 'text-zinc-500'} bg-zinc-800`}>
                          {ICON_MAP[plugin.ui?.sidebar_icon || ''] || <Puzzle className="w-3 h-3" />}
                          {PLUGIN_TYPE_META[plugin.plugin_type]?.label || plugin.plugin_type}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-zinc-800 text-zinc-500 font-bold">
                          {PLUGIN_CATEGORY_META[plugin.category]?.icon} {PLUGIN_CATEGORY_META[plugin.category]?.label}
                        </span>
                      </div>
                      <p className="text-[12px] text-zinc-500 truncate mt-0.5">{plugin.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-zinc-600">by {plugin.author}</span>
                        <span className="text-[10px] text-zinc-700">· {plugin.downloads.toLocaleString()} downloads</span>
                        {plugin.hooks.length > 0 && (
                          <span className="text-[10px] text-zinc-700">· {plugin.hooks.length} hook{(plugin.hooks.length !== 1 ? 's' : '')}</span>
                        )}
                        {plugin.tags.length > 0 && (
                          <div className="flex gap-1">
                            {plugin.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-1 py-0.5 rounded text-[8px] bg-zinc-800/50 text-zinc-600">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {plugin.homepage && (
                        <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors" onClick={e => e.stopPropagation()}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {isInstalled ? (
                        <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Check className="w-3 h-3" /> Installed
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); installPlugin(plugin); }}
                          disabled={installing === plugin.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {installing === plugin.id ? (
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedPlugin && (
        <div className="border-t border-white/[0.04] px-6 py-4 bg-zinc-900/50 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-2xl">
                {selectedPlugin.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-white">{selectedPlugin.name}</h3>
                <p className="text-[12px] text-zinc-400 mt-1">{selectedPlugin.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[11px] text-zinc-500">by {selectedPlugin.author}</span>
                  <span className="text-[11px] text-zinc-500">v{selectedPlugin.version}</span>
                  <span className="text-[11px] text-zinc-500">{selectedPlugin.downloads.toLocaleString()} downloads</span>
                  {selectedPlugin.hooks.length > 0 && (
                    <span className="text-[11px] text-zinc-500">Hooks: {selectedPlugin.hooks.join(', ')}</span>
                  )}
                </div>
                {selectedPlugin.config_schema && selectedPlugin.config_schema.length > 0 && (
                  <div className="mt-3 p-3 bg-zinc-800/50 rounded-lg">
                    <span className="text-[11px] font-medium text-zinc-400">Configuration:</span>
                    <div className="mt-1 space-y-1">
                      {selectedPlugin.config_schema.map(opt => (
                        <div key={opt.key} className="text-[11px] text-zinc-500">
                          <span className="text-zinc-300">{opt.label}</span>
                          {opt.required && <span className="text-red-400 ml-1">*</span>}
                          {opt.description && <span className="text-zinc-600 ml-1">— {opt.description}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
