import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Puzzle, Trash2, ToggleLeft, ToggleRight, ExternalLink, Store, AlertCircle, Settings } from 'lucide-react';
import type { Plugin, ConfigOption } from '../../types/plugin';
import { PLUGIN_CATEGORY_META, PLUGIN_TYPE_META } from '../../types/plugin';

export function PluginManagerPage({ onNavigateStore }: { onNavigateStore?: () => void }) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [configSchema, setConfigSchema] = useState<ConfigOption[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, any>>({});

  const load = async () => {
    try {
      setLoading(true);
      const list = await invoke<Plugin[]>('list_plugins');
      setPlugins(list);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const togglePlugin = async (id: string, enabled: boolean) => {
    try {
      if (enabled) await invoke('disable_plugin', { id });
      else await invoke('enable_plugin', { id });
      await load();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const uninstallPlugin = async (id: string) => {
    try {
      await invoke('uninstall_plugin', { id });
      await load();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const openConfigEditor = async (plugin: Plugin) => {
    try {
      const schema = await invoke<ConfigOption[]>('get_plugin_config_schema', { id: plugin.id });
      setConfigSchema(schema);
      setConfigValues(plugin.config || {});
      setEditingConfig(plugin.id);
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const saveConfig = async () => {
    if (!editingConfig) return;
    try {
      await invoke('update_plugin_config', { id: editingConfig, config: configValues });
      setEditingConfig(null);
      await load();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3">
          <Puzzle className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-semibold text-white tracking-tight">Plugins</h1>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-white/[0.06]">{plugins.length} installed</span>
        </div>
        {onNavigateStore && (
          <button onClick={onNavigateStore} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">
            <Store className="w-3.5 h-3.5" /> Browse Store
          </button>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-3 px-3 py-2 bg-red-500/10 text-red-300 text-[12px] rounded-lg border border-red-500/20 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {editingConfig && (
        <div className="mx-6 mt-3 p-4 bg-zinc-900/50 border border-white/[0.06] rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-zinc-400" />
              Configure {plugins.find(p => p.id === editingConfig)?.name}
            </h3>
            <button onClick={() => setEditingConfig(null)} className="text-zinc-500 hover:text-zinc-300 text-[12px]">✕</button>
          </div>
          <div className="space-y-3">
            {configSchema.map(opt => (
              <div key={opt.key}>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {opt.label}
                  {opt.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                {opt.description && <p className="text-[10px] text-zinc-600 mb-1">{opt.description}</p>}
                {opt.type === 'text' || opt.type === 'password' ? (
                  <input
                    type={opt.type}
                    value={configValues[opt.key] || ''}
                    onChange={e => setConfigValues({ ...configValues, [opt.key]: e.target.value })}
                    className="w-full h-8 px-3 rounded-lg bg-zinc-950 border border-white/[0.06] text-[12px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                ) : opt.type === 'number' ? (
                  <input
                    type="number"
                    value={configValues[opt.key] || ''}
                    onChange={e => setConfigValues({ ...configValues, [opt.key]: Number(e.target.value) })}
                    className="w-full h-8 px-3 rounded-lg bg-zinc-950 border border-white/[0.06] text-[12px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                ) : opt.type === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configValues[opt.key] ?? opt.default ?? false}
                      onChange={e => setConfigValues({ ...configValues, [opt.key]: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-500 focus:ring-indigo-500/30"
                    />
                    <span className="text-[12px] text-zinc-300">Enable</span>
                  </label>
                ) : opt.type === 'select' ? (
                  <select
                    value={configValues[opt.key] || opt.default || ''}
                    onChange={e => setConfigValues({ ...configValues, [opt.key]: e.target.value })}
                    className="w-full h-8 px-3 rounded-lg bg-zinc-950 border border-white/[0.06] text-[12px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  >
                    {opt.options?.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))}
            {configSchema.length === 0 && (
              <p className="text-[12px] text-zinc-500">This plugin has no configurable options.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setEditingConfig(null)} className="px-3 py-1.5 rounded-lg text-[12px] text-zinc-400 hover:text-zinc-300">Cancel</button>
            <button onClick={saveConfig} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-indigo-600 text-white hover:bg-indigo-500">Save Config</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto py-4 px-6">
          {loading ? (
            <div className="text-center text-zinc-500 py-20 text-[13px]">Loading plugins...</div>
          ) : plugins.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500">
              <Puzzle className="w-12 h-12 text-zinc-700 mb-4" />
              <p className="text-sm font-medium text-zinc-400">No plugins installed</p>
              <p className="text-xs text-zinc-600 mt-1">Install plugins from the store</p>
              {onNavigateStore && (
                <button onClick={onNavigateStore} className="mt-4 px-4 py-2 rounded-lg text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                  Browse Plugin Store
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {plugins.map(plugin => (
                <div key={plugin.id} className="rounded-xl bg-zinc-900/30 border border-white/[0.04] hover:border-white/[0.08] transition-colors overflow-hidden">
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg ${plugin.enabled ? 'bg-indigo-500/15 text-indigo-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {plugin.icon || plugin.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-zinc-200">{plugin.name}</span>
                        <span className="text-[10px] text-zinc-600 font-mono">v{plugin.version}</span>
                        <span className={`px-1 py-0.5 rounded text-[9px] font-bold uppercase ${PLUGIN_TYPE_META[plugin.plugin_type as keyof typeof PLUGIN_TYPE_META]?.color || 'text-zinc-500'} bg-zinc-800`}>
                          {PLUGIN_TYPE_META[plugin.plugin_type as keyof typeof PLUGIN_TYPE_META]?.label || plugin.plugin_type}
                        </span>
                        {plugin.category && (
                          <span className="px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-800 text-zinc-500">
                            {PLUGIN_CATEGORY_META[plugin.category]?.icon} {PLUGIN_CATEGORY_META[plugin.category]?.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-zinc-500 truncate mt-0.5">{plugin.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-zinc-600">by {plugin.author}</span>
                        {plugin.hooks.length > 0 && (
                          <span className="text-[10px] text-zinc-700">· {plugin.hooks.length} hook{(plugin.hooks.length !== 1 ? 's' : '')}</span>
                        )}
                        {plugin.config_schema && plugin.config_schema.length > 0 && (
                          <span className="text-[10px] text-zinc-700">· {plugin.config_schema.length} config option{(plugin.config_schema.length !== 1 ? 's' : '')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {plugin.homepage && (
                        <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors" title="Homepage">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {plugin.config_schema && plugin.config_schema.length > 0 && (
                        <button
                          onClick={() => openConfigEditor(plugin)}
                          className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                          title="Configure"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => togglePlugin(plugin.id, plugin.enabled)}
                        className={`p-2 rounded-lg transition-colors ${plugin.enabled ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-zinc-600 hover:bg-white/[0.06]'}`}
                        title={plugin.enabled ? 'Disable' : 'Enable'}
                      >
                        {plugin.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => uninstallPlugin(plugin.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Uninstall"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
