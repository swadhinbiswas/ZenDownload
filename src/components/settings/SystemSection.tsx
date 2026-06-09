import { useState, useEffect } from 'react';
import { Bell, Power, CheckCircle, XCircle, Loader2, Monitor } from 'lucide-react';
import {
  checkAndRequestNotificationPermission,
  getAutostartEnabled,
  setAutostartEnabled,
} from '../../services/notificationService';

export function SystemSection() {
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [autostart, setAutostartState] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  useEffect(() => {
    (async () => {
      const granted = await checkAndRequestNotificationPermission();
      setNotifGranted(granted);
      const auto = await getAutostartEnabled();
      setAutostartState(auto);
      const stored = localStorage.getItem('minimizeToTray');
      setMinimizeToTray(stored !== 'false');
    })();
  }, []);

  const requestPermission = async () => {
    setLoading(true);
    const granted = await checkAndRequestNotificationPermission();
    setNotifGranted(granted);
    setLoading(false);
  };

  const toggleAutostart = async () => {
    setLoading(true);
    const next = !autostart;
    await setAutostartEnabled(next);
    setAutostartState(next);
    setLoading(false);
  };

  const toggleMinimize = () => {
    const next = !minimizeToTray;
    setMinimizeToTray(next);
    localStorage.setItem('minimizeToTray', String(next));
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">System Integration</h3>
        <p className="text-xs text-zinc-500">Notifications, tray, and startup behavior</p>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-4 h-4 text-indigo-400" />
          <h4 className="text-[13px] font-medium text-zinc-200">Desktop Notifications</h4>
        </div>
        <p className="text-xs text-zinc-500">
          Show native system notifications for download completion, errors, and updates.
        </p>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {notifGranted === null ? (
              <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
            ) : notifGranted ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400">Permission granted</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-amber-400">Permission denied</span>
              </>
            )}
          </div>
          {!notifGranted && (
            <button
              onClick={requestPermission}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-700 text-white text-xs font-medium rounded-md transition-colors"
            >
              {loading ? 'Requesting...' : 'Request Permission'}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Power className="w-4 h-4 text-emerald-400" />
          <h4 className="text-[13px] font-medium text-zinc-200">Start at Login</h4>
        </div>
        <p className="text-xs text-zinc-500">
          Launch ZenDownload automatically when you sign in. Starts hidden in the system tray.
        </p>
        <label className="flex items-center justify-between pt-1 cursor-pointer">
          <span className="text-xs text-zinc-300">Enabled</span>
          <button
            type="button"
            onClick={toggleAutostart}
            disabled={loading}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              autostart ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                autostart ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Monitor className="w-4 h-4 text-purple-400" />
          <h4 className="text-[13px] font-medium text-zinc-200">Close Button</h4>
        </div>
        <p className="text-xs text-zinc-500">
          When you click the close (X) button, hide to the system tray instead of quitting.
          Downloads continue in the background. Use the tray icon to fully quit.
        </p>
        <label className="flex items-center justify-between pt-1 cursor-pointer">
          <span className="text-xs text-zinc-300">Minimize to tray on close</span>
          <button
            type="button"
            onClick={toggleMinimize}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              minimizeToTray ? 'bg-indigo-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                minimizeToTray ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </div>

      <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
        <p className="text-[11px] text-indigo-300">
          <strong>Tip:</strong> Click the ZenDownload icon in your system tray to see the active downloads menu,
          pause/resume all, or fully quit the app.
        </p>
      </div>
    </div>
  );
}
