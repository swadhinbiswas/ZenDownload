import { useEffect, useState } from 'react';
import { Calendar, Activity, KeyRound, Clipboard, Puzzle, Network, BarChart3, Loader2, Plus, Trash2, Star, Shield, Zap, Film, Music, HardDrive, BookOpen, Radio, Share2, Server } from 'lucide-react';
import { scheduleService, Schedule, ScheduleMode } from '../../services/scheduleService';
import { profileService, DownloadProfile, ProfileSettings } from '../../services/profileService';
import { healthService, HealthConfig, HealthCheck } from '../../services/healthService';
import { debridService, DebridAccount, DebridProvider, DebridStatus } from '../../services/debridService';
import { clipboardService, DetectedUrl } from '../../services/clipboardService';
import { pluginService, Plugin, PluginHook } from '../../services/pluginService';
import { mirrorService, Mirror, MirrorConfig } from '../../services/mirrorService';
import { analyticsService, AnalyticsSummary } from '../../services/analyticsService';
import { apiServerService, ApiServerStatus } from '../../services/apiServerService';

const TABS = [
  { id: 'profiles', label: 'Profiles', icon: Star },
  { id: 'schedule', label: 'Smart Queue', icon: Calendar },
  { id: 'health', label: 'Health Monitor', icon: Activity },
  { id: 'debrid', label: 'Debrid', icon: KeyRound },
  { id: 'clipboard', label: 'Clipboard', icon: Clipboard },
  { id: 'mirrors', label: 'Mirror Network', icon: Network },
  { id: 'plugins', label: 'Plugins', icon: Puzzle },
  { id: 'api', label: 'API Server', icon: Server },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]['id'];

const ICON_MAP: Record<string, any> = {
  'film': Film, 'music': Music, 'hard-drive': HardDrive,
  'book-open': BookOpen, 'radio': Radio, 'share-2': Share2,
};

const PROVIDER_LABELS: Record<DebridProvider, string> = {
  realdedbrid: 'Real-Debrid',
  alldebrid: 'AllDebrid',
  premiumize: 'Premiumize',
  debridlink: 'Debrid-Link',
  offcloud: 'Offcloud',
};

function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const val = n / Math.pow(1024, i);
  return `${val.toFixed(val < 10 ? 2 : val < 100 ? 1 : 0)} ${units[i]}`;
}

function formatSpeed(bps: number): string {
  return formatBytes(bps) + '/s';
}

function formatTimeAgo(ts: number): string {
  const diff = (Date.now() / 1000) - ts;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function AdvancedSettingsPage() {
  const [tab, setTab] = useState<TabId>('profiles');

  return (
    <div className="flex h-full">
      <aside className="w-56 border-r border-white/5 p-3 flex flex-col gap-1">
        <div className="px-2 py-3 mb-1">
          <h2 className="text-sm font-semibold text-zinc-200">Advanced</h2>
          <p className="text-[11px] text-zinc-500">Power user features</p>
        </div>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              tab === t.id
                ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </aside>
      <div className="flex-1 overflow-auto p-6">
        {tab === 'profiles' && <ProfilesTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'health' && <HealthTab />}
        {tab === 'debrid' && <DebridTab />}
        {tab === 'clipboard' && <ClipboardTab />}
        {tab === 'mirrors' && <MirrorsTab />}
        {tab === 'plugins' && <PluginsTab />}
        {tab === 'api' && <ApiServerTab />}
        {tab === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  );
}

function ProfilesTab() {
  const [profiles, setProfiles] = useState<DownloadProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DownloadProfile | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setProfiles(await profileService.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this profile?')) return;
    await profileService.remove(id);
    await load();
  };

  if (loading) return <Centered><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></Centered>;

  if (editing) {
    return <ProfileEditor profile={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />;
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Download Profiles</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Pre-configured templates for different types of downloads. URLs matching a pattern auto-apply.</p>
        </div>
        <button
          onClick={() => setEditing({
            id: '', name: '', description: '', icon: 'film', color: '#6366f1', category: 'Custom',
            settings: defaultProfileSettings(), url_patterns: [], builtin: false, created_at: 0,
          })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600"
        >
          <Plus className="w-4 h-4" /> New Profile
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {profiles.map(p => {
          const Icon = ICON_MAP[p.icon] || Star;
          return (
            <div key={p.id} className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${p.color}20`, color: p.color }}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100 truncate">{p.name}</h3>
                  {p.builtin && <span className="text-[9px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">BUILT-IN</span>}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{p.description}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                  <span><span className="text-zinc-400">{p.settings.default_threads}</span> threads</span>
                  {p.settings.auto_extract && <span className="text-emerald-500">auto-extract</span>}
                  {p.settings.auto_convert && <span className="text-purple-500">auto-convert</span>}
                  {p.settings.use_debrid && <span className="text-amber-500">debrid</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setEditing(p)} className="text-[11px] text-indigo-400 hover:text-indigo-300">Edit</button>
                {!p.builtin && <button onClick={() => handleDelete(p.id)} className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-0.5"><Trash2 className="w-3 h-3" /></button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function defaultProfileSettings(): ProfileSettings {
  return {
    default_threads: 8, max_speed_bps: null, auto_extract: false, auto_convert: false,
    default_conversion_preset: null, mirror_enabled: false, use_debrid: false, save_path: null,
    bandwidth_schedule_id: null, proxy: null, retry_attempts: 3, retry_delay_ms: 1000,
    checksum_verify: false, delete_partial_on_error: false,
  };
}

function ProfileEditor({ profile, onSaved, onCancel }: { profile: DownloadProfile; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<DownloadProfile>(profile);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const p = { ...draft };
      if (!p.id) p.id = `custom-${Date.now()}`;
      if (!p.created_at) p.created_at = Date.now() / 1000;
      await profileService.upsert(p);
      onSaved();
    } catch (e) {
      alert(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-zinc-100 mb-5">{profile.builtin ? 'View' : 'Edit'} Profile</h1>
      <div className="space-y-4 bg-zinc-900/40 border border-white/5 rounded-xl p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input value={draft.name} disabled={profile.builtin}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          </Field>
          <Field label="Category">
            <input value={draft.category} disabled={profile.builtin}
              onChange={e => setDraft({ ...draft, category: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          </Field>
        </div>
        <Field label="Description">
          <input value={draft.description} disabled={profile.builtin}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
        </Field>
        <Field label="URL Patterns (comma separated, * wildcards)">
          <input value={draft.url_patterns.join(', ')} disabled={profile.builtin}
            onChange={e => setDraft({ ...draft, url_patterns: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm font-mono" />
        </Field>
        <div className="border-t border-white/5 pt-4 mt-4">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Settings</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default threads">
              <input type="number" min={1} max={64} value={draft.settings.default_threads} disabled={profile.builtin}
                onChange={e => setDraft({ ...draft, settings: { ...draft.settings, default_threads: Number(e.target.value) }})}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            </Field>
            <Field label="Retry attempts">
              <input type="number" min={0} max={20} value={draft.settings.retry_attempts} disabled={profile.builtin}
                onChange={e => setDraft({ ...draft, settings: { ...draft.settings, retry_attempts: Number(e.target.value) }})}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            </Field>
            <Field label="Max speed (MB/s, empty=unlimited)">
              <input type="number" min={0} value={draft.settings.max_speed_bps ? draft.settings.max_speed_bps / 1_000_000 : ''} disabled={profile.builtin}
                onChange={e => setDraft({ ...draft, settings: { ...draft.settings, max_speed_bps: e.target.value ? Number(e.target.value) * 1_000_000 : null }})}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            </Field>
            <Field label="Save path (empty=default)">
              <input value={draft.settings.save_path || ''} disabled={profile.builtin}
                onChange={e => setDraft({ ...draft, settings: { ...draft.settings, save_path: e.target.value || null }})}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            </Field>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <Toggle label="Auto extract archives" checked={draft.settings.auto_extract} disabled={profile.builtin}
              onChange={v => setDraft({ ...draft, settings: { ...draft.settings, auto_extract: v }})} />
            <Toggle label="Auto convert" checked={draft.settings.auto_convert} disabled={profile.builtin}
              onChange={v => setDraft({ ...draft, settings: { ...draft.settings, auto_convert: v }})} />
            <Toggle label="Use mirror network" checked={draft.settings.mirror_enabled} disabled={profile.builtin}
              onChange={v => setDraft({ ...draft, settings: { ...draft.settings, mirror_enabled: v }})} />
            <Toggle label="Use debrid" checked={draft.settings.use_debrid} disabled={profile.builtin}
              onChange={v => setDraft({ ...draft, settings: { ...draft.settings, use_debrid: v }})} />
            <Toggle label="Verify checksum" checked={draft.settings.checksum_verify} disabled={profile.builtin}
              onChange={v => setDraft({ ...draft, settings: { ...draft.settings, checksum_verify: v }})} />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700">Cancel</button>
        {!profile.builtin && (
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        )}
      </div>
    </div>
  );
}

function ScheduleTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [stats, setStats] = useState<{ is_in_window: boolean; current_max_concurrent: number; next_window_start: string | null } | null>(null);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const load = async () => {
    setSchedules(await scheduleService.list());
    setStats(await scheduleService.stats());
  };

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">Smart Queue</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Schedule downloads to run at specific times with bandwidth limits.</p>
      </div>
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stat label="Active" value={String(stats.current_max_concurrent)} accent={stats.is_in_window ? 'emerald' : 'zinc'} />
          <Stat label="In Window" value={stats.is_in_window ? 'Yes' : 'No'} accent={stats.is_in_window ? 'emerald' : 'zinc'} />
          <Stat label="Next Window" value={stats.next_window_start || '—'} />
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">Schedules</h2>
        <button
          onClick={() => setEditing({
            id: '', name: 'New Schedule', mode: 'always', windows: [], default_max_concurrent: 4,
            default_max_speed_bps: null, enabled: true, color: '#6366f1',
          })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>
      {editing ? (
        <ScheduleEditor schedule={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
      ) : (
        <div className="space-y-2">
          {schedules.map(s => (
            <div key={s.id} className="bg-zinc-900/40 border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <h3 className="text-sm font-semibold text-zinc-100">{s.name}</h3>
                  <span className="text-[10px] text-zinc-500 uppercase">{s.mode}</span>
                  {s.enabled ? <span className="text-[10px] text-emerald-400">enabled</span> : <span className="text-[10px] text-zinc-500">disabled</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditing(s)} className="text-[11px] text-indigo-400">Edit</button>
                  {schedules.length > 1 && (
                    <button onClick={async () => { await scheduleService.remove(s.id); load(); }}
                      className="text-[11px] text-rose-400"><Trash2 className="w-3 h-3" /></button>
                  )}
                </div>
              </div>
              {s.windows.length > 0 && (
                <div className="mt-2 text-[11px] text-zinc-500">
                  {s.windows.map((w, i) => (
                    <span key={i} className="mr-3">{w.start_hour}:00-{w.end_hour}:00 · {w.days.join(',')} · max {w.max_concurrent}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleEditor({ schedule, onSaved, onCancel }: { schedule: Schedule; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Schedule>(schedule);
  const handleSave = async () => {
    const s = { ...draft };
    if (!s.id) s.id = `sched-${Date.now()}`;
    await scheduleService.upsert(s);
    onSaved();
  };
  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
        </Field>
        <Field label="Mode">
          <select value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as ScheduleMode })}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm">
            <option value="always">Always (24/7)</option>
            <option value="window">Time Window</option>
            <option value="offpeak">Off-Peak (nights/weekends)</option>
            <option value="manual">Manual Only</option>
          </select>
        </Field>
        <Field label="Max concurrent">
          <input type="number" min={1} max={32} value={draft.default_max_concurrent}
            onChange={e => setDraft({ ...draft, default_max_concurrent: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
        </Field>
        <Field label="Max speed (MB/s)">
          <input type="number" min={0} value={draft.default_max_speed_bps ? draft.default_max_speed_bps / 1_000_000 : ''}
            onChange={e => setDraft({ ...draft, default_max_speed_bps: e.target.value ? Number(e.target.value) * 1_000_000 : null })}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
        </Field>
      </div>
      <Toggle label="Enabled" checked={draft.enabled} onChange={v => setDraft({ ...draft, enabled: v })} />
      {draft.mode === 'window' && (
        <div className="border-t border-white/5 pt-3">
          <h3 className="text-xs font-semibold text-zinc-300 mb-2">Time Windows</h3>
          {draft.windows.map((w, i) => (
            <div key={i} className="flex items-center gap-2 mb-2 text-xs">
              <input type="number" min={0} max={23} value={w.start_hour}
                onChange={e => {
                  const newW = [...draft.windows]; newW[i] = { ...w, start_hour: Number(e.target.value) };
                  setDraft({ ...draft, windows: newW });
                }}
                className="w-16 px-2 py-1 rounded bg-zinc-800 border border-white/5" />
              <span className="text-zinc-500">to</span>
              <input type="number" min={0} max={23} value={w.end_hour}
                onChange={e => {
                  const newW = [...draft.windows]; newW[i] = { ...w, end_hour: Number(e.target.value) };
                  setDraft({ ...draft, windows: newW });
                }}
                className="w-16 px-2 py-1 rounded bg-zinc-800 border border-white/5" />
              <input type="text" value={w.days.join(',')}
                onChange={e => {
                  const newW = [...draft.windows]; newW[i] = { ...w, days: e.target.value.split(',').map(s => s.trim()).filter(Boolean) };
                  setDraft({ ...draft, windows: newW });
                }}
                className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-white/5" />
              <button onClick={() => setDraft({ ...draft, windows: draft.windows.filter((_, j) => j !== i) })}
                className="text-rose-400"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => setDraft({ ...draft, windows: [...draft.windows, { start_hour: 9, end_hour: 17, days: ['mon','tue','wed','thu','fri'], max_concurrent: 3, max_speed_bps: null }] })}
            className="text-[11px] text-indigo-400 mt-1">+ Add window</button>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
        <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm">Save</button>
      </div>
    </div>
  );
}

function HealthTab() {
  const [config, setConfig] = useState<HealthConfig | null>(null);
  const [checks, setChecks] = useState<HealthCheck[]>([]);

  const load = async () => {
    setConfig(await healthService.getConfig());
    setChecks(await healthService.list());
  };
  useEffect(() => { load(); }, []);

  if (!config) return <Centered><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></Centered>;

  const update = async (patch: Partial<HealthConfig>) => {
    const c = { ...config, ...patch };
    setConfig(c);
    await healthService.setConfig(c);
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">Health Monitor</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Periodically check link availability and pause downloads with too many failures.</p>
      </div>
      <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5 mb-5 space-y-3">
        <Toggle label="Enabled" checked={config.enabled} onChange={v => update({ enabled: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check interval (seconds)">
            <input type="number" value={config.check_interval_secs} onChange={e => update({ check_interval_secs: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          </Field>
          <Field label="Auto-pause threshold (failures)">
            <input type="number" value={config.auto_pause_threshold} onChange={e => update({ auto_pause_threshold: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          </Field>
        </div>
      </div>
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Active Checks ({checks.length})</h2>
      {checks.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">No active downloads being monitored yet.</p>
      ) : (
        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.download_id} className="bg-zinc-900/40 border border-white/5 rounded-lg p-3 flex items-center gap-3">
              <Shield className={`w-4 h-4 ${(c.last_status >= 200 && c.last_status < 400) ? 'text-emerald-400' : 'text-rose-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 truncate">{c.url}</p>
                <p className="text-[10px] text-zinc-500">Last: {c.last_checked > 0 ? formatTimeAgo(c.last_checked) : 'never'} · {c.consecutive_failures} failures · {c.avg_latency_ms.toFixed(0)}ms avg</p>
              </div>
              <span className="text-xs font-mono text-zinc-400">HTTP {c.last_status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DebridTab() {
  const [accounts, setAccounts] = useState<DebridAccount[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DebridStatus>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DebridAccount>({ id: '', provider: 'realdedbrid', api_key: '', enabled: true, priority: 0, label: '' });
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = async () => {
    setAccounts(await debridService.list());
    const stats = await debridService.listStatuses();
    setStatuses(Object.fromEntries(stats.map(s => [s.id, s])));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!draft.api_key.trim()) { alert('API key required'); return; }
    if (!draft.label.trim()) draft.label = PROVIDER_LABELS[draft.provider];
    await debridService.upsert(draft);
    setAdding(false);
    setDraft({ id: '', provider: 'realdedbrid', api_key: '', enabled: true, priority: 0, label: '' });
    await load();
  };

  const handleVerify = async (id: string) => {
    setVerifying(id);
    try {
      await debridService.verify(id);
      await load();
    } catch (e) {
      alert(`Verify failed: ${e}`);
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">Debrid Services</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Multi-hoster premium accounts. URLs from supported hosts are automatically unrestricted.</p>
      </div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600">
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>
      {adding && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider">
              <select value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value as DebridProvider })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm">
                {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Label">
              <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })}
                placeholder="My account" className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            </Field>
            <Field label="API Key">
              <input type="password" value={draft.api_key} onChange={e => setDraft({ ...draft, api_key: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm font-mono" />
            </Field>
            <Field label="Priority (lower=first)">
              <input type="number" value={draft.priority} onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            </Field>
          </div>
          <Toggle label="Enabled" checked={draft.enabled} onChange={v => setDraft({ ...draft, enabled: v })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={handleAdd} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm">Add</button>
          </div>
        </div>
      )}
      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-12">No debrid accounts configured.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map(a => {
            const status = statuses[a.id];
            return (
              <div key={a.id} className="bg-zinc-900/40 border border-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <KeyRound className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-zinc-100">{a.label}</h3>
                        <span className="text-[10px] text-zinc-500">{PROVIDER_LABELS[a.provider]}</span>
                        {!a.enabled && <span className="text-[10px] text-rose-400">disabled</span>}
                      </div>
                      {status && (
                        <p className={`text-[10px] mt-0.5 ${status.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {status.valid ? `✓ ${status.user || 'Valid'}` : `✗ ${status.error}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleVerify(a.id)} disabled={verifying === a.id}
                      className="text-[11px] text-indigo-400 disabled:opacity-50">
                      {verifying === a.id ? 'Verifying...' : 'Verify'}
                    </button>
                    <button onClick={async () => { await debridService.remove(a.id); load(); }}
                      className="text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClipboardTab() {
  const [config, setConfig] = useState<{ enabled: boolean; auto_add: boolean } | null>(null);
  const [detected, setDetected] = useState<DetectedUrl[]>([]);

  const load = async () => {
    const c = await clipboardService.getConfig();
    setConfig({ enabled: c.enabled, auto_add: c.auto_add });
    setDetected(await clipboardService.listDetected());
  };

  useEffect(() => { load(); }, []);

  if (!config) return <Centered><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></Centered>;

  const update = async (patch: Partial<{ enabled: boolean; auto_add: boolean }>) => {
    const c = { ...config, ...patch };
    setConfig(c);
    const full = await clipboardService.getConfig();
    await clipboardService.setConfig({ ...full, ...c });
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">Clipboard Intelligence</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Auto-detect URLs in clipboard and add them as downloads.</p>
      </div>
      <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5 mb-5 space-y-3">
        <Toggle label="Monitor clipboard" checked={config.enabled} onChange={v => update({ enabled: v })} />
        <Toggle label="Auto-add detected URLs" checked={config.auto_add} onChange={v => update({ auto_add: v })} />
      </div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">Detected URLs ({detected.length})</h2>
        <button onClick={async () => { await clipboardService.clear(); load(); }}
          className="text-[11px] text-zinc-400 hover:text-zinc-200">Clear all</button>
      </div>
      {detected.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-12">No URLs detected yet. Copy a URL to test.</p>
      ) : (
        <div className="space-y-1.5">
          {detected.map((d, i) => (
            <div key={i} className="bg-zinc-900/40 border border-white/5 rounded-lg p-2.5 flex items-center gap-2.5">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 truncate">{d.url}</p>
                <p className="text-[10px] text-zinc-500">{d.pattern} · {formatTimeAgo(d.detected_at)} {d.ignored && '· ignored'}</p>
              </div>
              <button onClick={async () => { await clipboardService.ignore(d.url); load(); }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300">Ignore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MirrorsTab() {
  const [config, setConfig] = useState<MirrorConfig | null>(null);
  const [mirrors, setMirrors] = useState<Mirror[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Mirror>({ id: '', url: '', region: 'auto', priority: 0, enabled: true, last_latency_ms: 0, last_status: 0, last_checked: 0, success_count: 0, failure_count: 0, avg_speed_bps: 0, health_score: 0 });

  const load = async () => {
    setConfig(await mirrorService.getConfig());
    setMirrors(await mirrorService.list());
  };
  useEffect(() => { load(); }, []);

  if (!config) return <Centered><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></Centered>;

  const update = async (patch: Partial<MirrorConfig>) => {
    const c = { ...config, ...patch };
    setConfig(c);
    await mirrorService.setConfig(c);
  };

  const handleAdd = async () => {
    if (!draft.url.trim()) return;
    await mirrorService.add(draft);
    setAdding(false);
    setDraft({ ...draft, id: '', url: '' });
    await load();
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">Mirror Network</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Distribute download chunks across multiple mirrors for maximum speed and reliability.</p>
      </div>
      <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5 mb-5 space-y-3">
        <Toggle label="Enable mirror network" checked={config.enabled} onChange={v => update({ enabled: v })} />
        <Toggle label="Smart routing (health-based)" checked={config.smart_routing} onChange={v => update({ smart_routing: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parallel mirrors">
            <input type="number" min={1} max={10} value={config.parallel_mirrors} onChange={e => update({ parallel_mirrors: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          </Field>
          <Field label="Health check interval (s)">
            <input type="number" min={60} value={config.check_interval_secs} onChange={e => update({ check_interval_secs: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          </Field>
        </div>
      </div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm">
          <Plus className="w-4 h-4" /> Add Mirror
        </button>
      </div>
      {adding && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 mb-3 grid grid-cols-3 gap-3">
          <input value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://mirror.example.com" className="col-span-2 px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          <input value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value })} placeholder="us-east" className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          <button onClick={handleAdd} className="col-span-3 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm">Add</button>
        </div>
      )}
      {mirrors.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">No mirrors configured.</p>
      ) : (
        <div className="space-y-2">
          {mirrors.map(m => (
            <div key={m.id} className="bg-zinc-900/40 border border-white/5 rounded-lg p-3 flex items-center gap-3">
              <Network className="w-4 h-4 text-cyan-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 truncate">{m.url}</p>
                <p className="text-[10px] text-zinc-500">{m.region} · health {m.health_score.toFixed(0)}% · {m.last_latency_ms}ms</p>
              </div>
              <button onClick={async () => { await mirrorService.remove(m.id); load(); }} className="text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PluginsTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [hooks, setHooks] = useState<PluginHook[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<Plugin>({ id: '', name: '', version: '1.0.0', author: '', description: '', homepage: null, plugin_type: 'webhook', enabled: true, config: {}, hooks: [], installed_at: 0, path: null, ui: null, icon: '🔌', category: 'utility', tags: [], min_version: null, screenshots: [], config_schema: [], downloads: 0 });

  const load = async () => {
    setPlugins(await pluginService.list());
    setHooks(await pluginService.listHooks());
  };
  useEffect(() => { load(); }, []);

  const handleInstall = async () => {
    if (!draft.id || !draft.name) { alert('ID and name required'); return; }
    try {
      await pluginService.install(draft);
      setShowAdd(false);
      setDraft({ ...draft, id: '', name: '' });
      await load();
    } catch (e) {
      alert(`Install failed: ${e}`);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">Plugins</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Extend ZenDownload with custom extractors, webhooks, and integrations.</p>
      </div>
      <div className="mb-5">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase mb-2">Available Hooks</h2>
        <div className="grid grid-cols-2 gap-2">
          {hooks.map(h => (
            <div key={h.name} className="bg-zinc-900/40 border border-white/5 rounded-lg p-2.5">
              <code className="text-xs text-indigo-400">{h.name}</code>
              <p className="text-[10px] text-zinc-500 mt-0.5">{h.description}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm">
          <Plus className="w-4 h-4" /> Install Plugin
        </button>
      </div>
      {showAdd && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={draft.id} onChange={e => setDraft({ ...draft, id: e.target.value })} placeholder="my-plugin" className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="My Plugin" className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            <input value={draft.version} onChange={e => setDraft({ ...draft, version: e.target.value })} placeholder="1.0.0" className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            <input value={draft.author} onChange={e => setDraft({ ...draft, author: e.target.value })} placeholder="Author" className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
            <select value={draft.plugin_type} onChange={e => setDraft({ ...draft, plugin_type: e.target.value as any })} className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm">
              <option value="extractor">Extractor</option>
              <option value="postprocessor">Post-Processor</option>
              <option value="webhook">Webhook</option>
              <option value="notifier">Notifier</option>
              <option value="protocolhandler">Protocol Handler</option>
              <option value="mirror">Mirror</option>
            </select>
            <input value={draft.hooks.join(',')} onChange={e => setDraft({ ...draft, hooks: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="download.complete,download.start" className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          </div>
          <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Description" className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm" />
          <button onClick={handleInstall} className="w-full px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm">Install</button>
        </div>
      )}
      {plugins.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">No plugins installed.</p>
      ) : (
        <div className="space-y-2">
          {plugins.map(p => (
            <div key={p.id} className="bg-zinc-900/40 border border-white/5 rounded-lg p-3 flex items-center gap-3">
              <Puzzle className="w-4 h-4 text-violet-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm text-zinc-100">{p.name}</h3>
                  <span className="text-[10px] text-zinc-500">v{p.version}</span>
                  <span className="text-[10px] text-zinc-600">{p.plugin_type}</span>
                  {!p.enabled && <span className="text-[10px] text-rose-400">disabled</span>}
                </div>
                <p className="text-[10px] text-zinc-500 truncate">{p.description}</p>
              </div>
              <button onClick={async () => { p.enabled ? await pluginService.disable(p.id) : await pluginService.enable(p.id); load(); }}
                className="text-[11px] text-indigo-400">{p.enabled ? 'Disable' : 'Enable'}</button>
              <button onClick={async () => { await pluginService.uninstall(p.id); load(); }} className="text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    const load = async () => setSummary(await analyticsService.summary());
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  if (!summary) return <Centered><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></Centered>;

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">Analytics</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Insights into your download history and patterns.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Total downloads" value={summary.total_downloads.toLocaleString()} />
        <Stat label="Total volume" value={formatBytes(summary.total_bytes)} />
        <Stat label="Avg speed" value={formatSpeed(summary.avg_speed_bps)} />
        <Stat label="Success rate" value={`${(summary.success_rate * 100).toFixed(1)}%`} accent={summary.success_rate >= 0.9 ? 'emerald' : 'rose'} />
        <Stat label="Peak speed" value={formatSpeed(summary.peak_speed_bps)} />
        <Stat label="Current speed" value={formatSpeed(summary.current_speed_bps)} accent="emerald" />
      </div>
      {summary.downloads_by_category.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">By category</h2>
          <div className="space-y-1.5">
            {summary.downloads_by_category.map(c => {
              const max = summary.downloads_by_category[0]?.count || 1;
              const pct = (c.count / max) * 100;
              return (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-300 w-32 truncate">{c.name}</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 w-12 text-right">{c.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {summary.top_hosts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Top hosts</h2>
          <div className="space-y-1.5">
            {summary.top_hosts.map(h => (
              <div key={h.name} className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">{h.name}</span>
                <span className="text-zinc-500">{h.count} downloads</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2.5 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <button onClick={() => !disabled && onChange(!checked)}
        className={`w-8 h-4.5 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-zinc-700'} relative shrink-0`}
        style={{ width: 32, height: 18 }}>
        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[15px]' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-zinc-300">{label}</span>
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'rose' | 'zinc' }) {
  const color = accent === 'emerald' ? 'text-emerald-400' : accent === 'rose' ? 'text-rose-400' : 'text-zinc-200';
  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-lg p-3">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center py-12">{children}</div>;
}

function ApiServerTab() {
  const [status, setStatus] = useState<ApiServerStatus | null>(null);
  const [port, setPort] = useState(9527);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const s = await apiServerService.getStatus();
    setStatus(s);
    setPort(s.port);
  };
  useEffect(() => { load(); }, []);

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      if (enabled) {
        await apiServerService.enable(port);
      } else {
        await apiServerService.disable();
      }
      await load();
    } catch (e) {
      alert(`Failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!status) return <Centered><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></Centered>;

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-zinc-100">API Server</h1>
        <p className="text-sm text-zinc-500 mt-0.5">REST API for browser extensions, mobile apps, and automation. Disabled by default for security.</p>
      </div>

      <div className={`border rounded-xl p-5 mb-5 ${status.enabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900/40 border-white/5'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${status.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">{status.enabled ? 'Running' : 'Stopped'}</h2>
              <p className="text-[11px] text-zinc-500">
                {status.enabled ? `Listening on ${status.url}` : 'Off — no network exposure'}
              </p>
            </div>
          </div>
          <Toggle label={status.enabled ? 'Enabled' : 'Disabled'} checked={status.enabled} onChange={handleToggle} disabled={saving} />
        </div>

        <Field label="Port">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              disabled={status.enabled}
              className="w-32 px-3 py-2 rounded-lg bg-zinc-800 border border-white/5 text-sm font-mono disabled:opacity-50"
            />
            <span className="text-[10px] text-zinc-500">Requires restart to apply port change</span>
          </div>
        </Field>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-5">
        <h3 className="text-sm font-semibold text-amber-300 mb-1">Security warning</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          The REST API binds to localhost only (127.0.0.1) and has no authentication.
          Do not enable on untrusted networks or shared machines without additional protections.
          Use the WebSocket native messaging host on port 6800 for browser extension integration — it's safer.
        </p>
      </div>

      {status.enabled && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">API Endpoints</h2>
          <div className="space-y-1.5 font-mono text-xs">
            {[
              ['GET', '/api/health', 'Health check'],
              ['GET', '/api/downloads', 'List all downloads'],
              ['POST', '/api/downloads', 'Add download: { url, save_path, threads, category }'],
              ['POST', '/api/downloads/:id/pause', 'Pause a download'],
              ['POST', '/api/downloads/:id/resume', 'Resume a download'],
              ['POST', '/api/downloads/:id/cancel', 'Cancel a download'],
              ['DELETE', '/api/downloads/:id', 'Delete a download'],
              ['GET', '/api/stats', 'Download statistics'],
              ['GET', '/api/profiles', 'List download profiles'],
            ].map(([method, path, desc]) => (
              <div key={path as string} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-zinc-900/40 border border-white/5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  method === 'GET' ? 'bg-blue-500/20 text-blue-300' :
                  method === 'POST' ? 'bg-emerald-500/20 text-emerald-300' :
                  'bg-rose-500/20 text-rose-300'
                }`}>{method}</span>
                <code className="text-zinc-300 flex-1">{path}</code>
                <span className="text-zinc-500 text-[11px]">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
