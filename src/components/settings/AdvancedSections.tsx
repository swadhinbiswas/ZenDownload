import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FolderOpen, Clock, Plus, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface WatchFolderSectionProps {
  watchPath: string;
  watchAutoAdd: boolean;
  watchCategory: string;
  onChange: (patch: { watchFolderPath?: string; watchFolderAutoAdd?: boolean; watchFolderCategory?: string }) => void;
}

export function WatchFolderSection({ watchPath, watchAutoAdd, watchCategory, onChange }: WatchFolderSectionProps) {
  const pickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        onChange({ watchFolderPath: selected });
      }
    } catch (e) {
      console.error('Failed to pick folder:', e);
    }
  };

  const startWatching = async () => {
    if (!watchPath) return;
    try {
      await invoke('add_watch_folder', {
        config: {
          path: watchPath,
          autoAdd: watchAutoAdd,
          autoDelete: false,
          category: watchCategory,
          enabled: true,
        },
      });
    } catch (e) {
      console.error('Failed to start watcher:', e);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-white tracking-tight">Watch Folder</h3>
        <p className="text-sm text-zinc-400 mb-5 mt-1">Automatically detect new files dropped in a folder and queue them for download tracking.</p>
      </div>
      <div className="space-y-3 max-w-2xl">
        <div>
          <Label className="text-zinc-300 font-semibold text-sm mb-2 block">Folder to Watch</Label>
          <div className="flex gap-2">
            <Input
              value={watchPath}
              onChange={(e) => onChange({ watchFolderPath: e.target.value })}
              placeholder="/path/to/downloads/incoming"
              className="bg-zinc-900/50 border-white/10 text-white h-11"
            />
            <Button onClick={pickFolder} variant="outline" className="border-white/10 text-zinc-300 hover:bg-white/5 h-11">
              <FolderOpen className="w-4 h-4 mr-1.5" />
              Browse
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-6 pt-2">
          <Label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={watchAutoAdd}
              onChange={(e) => onChange({ watchFolderAutoAdd: e.target.checked })}
              className="rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500/50"
            />
            <span className="text-sm text-zinc-300">Auto-add detected files to history</span>
          </Label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-500">Category:</Label>
            <select
              value={watchCategory}
              onChange={(e) => onChange({ watchFolderCategory: e.target.value })}
              className="bg-zinc-900/50 border border-white/10 text-white text-sm rounded-md px-2 py-1"
            >
              {['General', 'Compressed', 'Documents', 'Music', 'Programs', 'Video'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <Button
          onClick={startWatching}
          disabled={!watchPath}
          className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20"
        >
          <Eye className="w-4 h-4 mr-1.5" />
          Start Watching
        </Button>
      </div>
    </div>
  );
}

interface SchedulerSectionProps {
  schedulerEnabled: boolean;
  tasks: Array<{
    id: string;
    startAt: string;
    action: string;
    repeat?: string;
    enabled: boolean;
  }>;
  onChange: (patch: { schedulerEnabled?: boolean }) => void;
  onRefresh: () => void;
}

export function SchedulerSection({ schedulerEnabled, tasks, onChange, onRefresh }: SchedulerSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">Download Scheduler</h3>
          <p className="text-sm text-zinc-400 mt-1">Schedule downloads to start/pause at specific times — useful for off-peak bandwidth.</p>
        </div>
        <Label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={schedulerEnabled}
            onChange={(e) => onChange({ schedulerEnabled: e.target.checked })}
            className="rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500/50"
          />
          <span className="text-sm text-zinc-300">Enabled</span>
        </Label>
      </div>
      <div className="bg-zinc-900/30 border border-white/[0.06] rounded-xl p-4">
        {tasks.length === 0 ? (
          <div className="text-center py-6 text-sm text-zinc-500">No scheduled tasks yet</div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span className="text-zinc-200">{new Date(task.startAt).toLocaleString()}</span>
                  <span className="text-zinc-500">→</span>
                  <span className="text-zinc-300 capitalize">{task.action}</span>
                  {task.repeat && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-indigo-500/10 text-indigo-300 rounded">{task.repeat}</span>}
                </div>
                <button
                  onClick={async () => {
                    await invoke('delete_scheduled_task', { id: task.id });
                    onRefresh();
                  }}
                  className="text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface BandwidthProfileSectionProps {
  enabled: boolean;
  defaultLimitKbps: number;
  rules: Array<{ dayOfWeek: number; startHour: number; endHour: number; limitKbps: number }>;
  onChange: (patch: {
    bandwidthProfileEnabled?: boolean;
    bandwidthDefaultLimitKbps?: number;
    bandwidthRules?: Array<{ dayOfWeek: number; startHour: number; endHour: number; limitKbps: number }>;
  }) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BandwidthProfileSection({ enabled, defaultLimitKbps, rules, onChange }: BandwidthProfileSectionProps) {
  const addRule = () => {
    onChange({ bandwidthRules: [...rules, { dayOfWeek: -1, startHour: 0, endHour: 24, limitKbps: 10000 }] });
  };

  const updateRule = (idx: number, patch: Partial<{ dayOfWeek: number; startHour: number; endHour: number; limitKbps: number }>) => {
    const newRules = [...rules];
    newRules[idx] = { ...newRules[idx], ...patch };
    onChange({ bandwidthRules: newRules });
  };

  const removeRule = (idx: number) => {
    onChange({ bandwidthRules: rules.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">Bandwidth Profile</h3>
          <p className="text-sm text-zinc-400 mt-1">Set time-of-day speed limits so heavy downloads don't disrupt your workday.</p>
        </div>
        <Label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange({ bandwidthProfileEnabled: e.target.checked })}
            className="rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500/50"
          />
          <span className="text-sm text-zinc-300">Enabled</span>
        </Label>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-zinc-400">Default Limit (KB/s, 0=unlimited):</Label>
          <Input
            type="number"
            value={defaultLimitKbps}
            onChange={(e) => onChange({ bandwidthDefaultLimitKbps: parseInt(e.target.value) || 0 })}
            className="bg-zinc-900/50 border-white/10 text-white w-32 h-9"
          />
        </div>
        <Button
          onClick={addRule}
          size="sm"
          className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Time Rule
        </Button>
        {rules.length > 0 && (
          <div className="space-y-2">
            {rules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-zinc-900/30 border border-white/[0.06] rounded-lg">
                <select
                  value={rule.dayOfWeek}
                  onChange={(e) => updateRule(idx, { dayOfWeek: parseInt(e.target.value) })}
                  className="bg-zinc-900/50 border border-white/10 text-white text-xs rounded px-2 py-1"
                >
                  <option value={-1}>Every day</option>
                  {DAY_NAMES.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={rule.startHour}
                  onChange={(e) => updateRule(idx, { startHour: parseInt(e.target.value) || 0 })}
                  className="bg-zinc-900/50 border-white/10 text-white w-20 h-8"
                />
                <span className="text-zinc-500 text-xs">to</span>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={rule.endHour}
                  onChange={(e) => updateRule(idx, { endHour: parseInt(e.target.value) || 0 })}
                  className="bg-zinc-900/50 border-white/10 text-white w-20 h-8"
                />
                <Input
                  type="number"
                  value={rule.limitKbps}
                  onChange={(e) => updateRule(idx, { limitKbps: parseInt(e.target.value) || 0 })}
                  className="bg-zinc-900/50 border-white/10 text-white w-32 h-8"
                  placeholder="KB/s"
                />
                <span className="text-zinc-500 text-xs">KB/s</span>
                <button onClick={() => removeRule(idx)} className="text-zinc-500 hover:text-red-400 ml-auto">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface VirusTotalSectionProps {
  apiKey: string;
  autoScan: boolean;
  threshold: number;
  onChange: (patch: { virustotalApiKey?: string; virustotalAutoScan?: boolean; virustotalThreatThreshold?: number }) => void;
}

export function VirusTotalSection({ apiKey, autoScan, threshold, onChange }: VirusTotalSectionProps) {
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-white tracking-tight">VirusTotal Security</h3>
        <p className="text-sm text-zinc-400 mt-1">Scan downloaded files via the VirusTotal public API. Requires a free API key.</p>
      </div>
      <div className="space-y-3 max-w-xl">
        <div>
          <Label className="text-zinc-300 font-semibold text-sm mb-2 block">API Key</Label>
          <div className="flex gap-2">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onChange({ virustotalApiKey: e.target.value })}
              placeholder="Your VT API key"
              className="bg-zinc-900/50 border-white/10 text-white h-11"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowKey(!showKey)}
              className="text-zinc-500"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScan}
              onChange={(e) => onChange({ virustotalAutoScan: e.target.checked })}
              className="rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500/50"
            />
            <span className="text-sm text-zinc-300">Auto-scan completed downloads</span>
          </Label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-500">Threat threshold:</Label>
            <Input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => onChange({ virustotalThreatThreshold: parseInt(e.target.value) || 3 })}
              className="bg-zinc-900/50 border-white/10 text-white w-16 h-8"
            />
            <span className="text-xs text-zinc-500">engines</span>
          </div>
        </div>
        {autoScan && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg text-xs text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Auto-scan runs after each download completes. Scans are subject to VT rate limits (4 req/min for free API).
          </div>
        )}
        {apiKey && !autoScan && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-xs text-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            API key configured. You can right-click a download to scan it manually.
          </div>
        )}
      </div>
    </div>
  );
}
