import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileText, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface BackupManagerProps {
  onChange: (patch: { autoBackupEnabled?: boolean }) => void;
  autoBackupEnabled: boolean;
}

export function BackupManager({ onChange, autoBackupEnabled }: BackupManagerProps) {
  const [backups, setBackups] = useState<string[]>([]);
  const [working, setWorking] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backupDir, setBackupDir] = useState<string>('');

  useEffect(() => {
    if (isTauri()) {
      // Default to home/ZenDownload/backups
      setBackupDir('~/ZenDownload/backups');
      refreshList();
    }
  }, []);

  const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

  const refreshList = async () => {
    try {
      const list = await invoke<string[]>('list_settings_backups', { backupDir });
      setBackups(list);
    } catch (e) {
      // Directory may not exist yet
      setBackups([]);
    }
  };

  const handleExport = async () => {
    setWorking('export');
    setMessage(null);
    try {
      const path = await save({
        defaultPath: `zendownload-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) {
        setWorking(null);
        return;
      }
      const result = await invoke<string>('export_settings_backup', { outputPath: path });
      setMessage({ type: 'success', text: `Exported to ${result}` });
      refreshList();
    } catch (e: any) {
      setMessage({ type: 'error', text: typeof e === 'string' ? e : (e?.message || 'Export failed') });
    } finally {
      setWorking(null);
    }
  };

  const handleImport = async () => {
    setWorking('import');
    setMessage(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path || typeof path !== 'string') {
        setWorking(null);
        return;
      }
      const count = await invoke<number>('import_settings_backup', { inputPath: path });
      setMessage({ type: 'success', text: `Imported ${count} settings` });
    } catch (e: any) {
      setMessage({ type: 'error', text: typeof e === 'string' ? e : (e?.message || 'Import failed') });
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-white tracking-tight">Settings Backup & Restore</h3>
        <p className="text-sm text-zinc-400 mt-1">Export your settings to a portable JSON file. Useful for syncing between machines.</p>
      </div>
      <div className="space-y-3 max-w-2xl">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoBackupEnabled}
              onChange={(e) => onChange({ autoBackupEnabled: e.target.checked })}
              className="rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500/50"
            />
            <span className="text-sm text-zinc-300">Auto-backup on every settings change</span>
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleExport}
            disabled={working !== null}
            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20"
          >
            {working === 'export' ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
            Export Settings
          </Button>
          <Button
            onClick={handleImport}
            disabled={working !== null}
            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20"
          >
            {working === 'import' ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            Import Settings
          </Button>
          <Button
            onClick={refreshList}
            variant="ghost"
            className="text-zinc-500"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        {message && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-xs ${
            message.type === 'success'
              ? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-200'
              : 'bg-red-500/5 border border-red-500/10 text-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            {message.text}
          </div>
        )}
        {backups.length > 0 && (
          <div className="bg-zinc-900/30 border border-white/[0.06] rounded-xl p-3">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Recent Backups</div>
            <div className="space-y-1">
              {backups.slice(0, 5).map((b) => (
                <div key={b} className="flex items-center gap-2 text-sm py-1">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-zinc-300 font-mono text-xs">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
