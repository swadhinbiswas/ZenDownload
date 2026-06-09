import { useState, useEffect, useRef } from 'react';
import { Timer as TimerIcon, Play, Pause, RotateCcw } from 'lucide-react';

export function TimerPlugin() {
  const [mode, setMode] = useState<'stopwatch' | 'timer' | 'pomodoro'>('stopwatch');
  const [swTime, setSwTime] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerTime, setTimerTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [pomTime, setPomTime] = useState(25 * 60);
  const [pomRunning, setPomRunning] = useState(false);
  const [pomIsBreak, setPomIsBreak] = useState(false);
  const [pomCount, setPomCount] = useState({ focus: 0, break: 0 });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const toggleSW = () => {
    if (swRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSwRunning(false);
    } else {
      const start = Date.now() - swTime * 1000;
      intervalRef.current = setInterval(() => setSwTime(Math.floor((Date.now() - start) / 1000)), 100);
      setSwRunning(true);
    }
  };

  const resetSW = () => { if (intervalRef.current) clearInterval(intervalRef.current); setSwRunning(false); setSwTime(0); };

  const startTimer = () => {
    if (timerRunning) { if (intervalRef.current) clearInterval(intervalRef.current); setTimerRunning(false); return; }
    if (timerTime <= 0) setTimerTime(timerMinutes * 60);
    intervalRef.current = setInterval(() => {
      setTimerTime(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current!); setTimerRunning(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    setTimerRunning(true);
  };

  const togglePom = () => {
    if (pomRunning) { if (intervalRef.current) clearInterval(intervalRef.current); setPomRunning(false); return; }
    intervalRef.current = setInterval(() => {
      setPomTime(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setPomRunning(false);
          if (pomIsBreak) { setPomCount(p => ({ ...p, break: p.break + 1 })); setPomIsBreak(false); return 25 * 60; }
          else { setPomCount(p => ({ ...p, focus: p.focus + 1 })); setPomIsBreak(true); return 5 * 60; }
        }
        return prev - 1;
      });
    }, 1000);
    setPomRunning(true);
  };

  const tabs = [
    { id: 'stopwatch' as const, label: 'Stopwatch' },
    { id: 'timer' as const, label: 'Timer' },
    { id: 'pomodoro' as const, label: 'Pomodoro' },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="max-w-sm mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <TimerIcon className="w-5 h-5 text-sky-400" />
          <h2 className="text-lg font-semibold text-white">Timer</h2>
        </div>

        <div className="flex gap-1 mb-6 bg-zinc-900/50 rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                mode === t.id ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === 'stopwatch' && (
          <div className="text-center">
            <div className="text-5xl font-mono font-bold text-white mb-6">{fmt(swTime)}</div>
            <div className="flex gap-2 justify-center">
              <button onClick={toggleSW} className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-[13px] font-medium hover:bg-sky-500 transition-colors flex items-center gap-2">
                {swRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {swRunning ? 'Pause' : 'Start'}
              </button>
              <button onClick={resetSW} className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-[13px] font-medium hover:bg-zinc-700 transition-colors flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        )}

        {mode === 'timer' && (
          <div className="text-center">
            {!timerRunning && timerTime === 0 && (
              <div className="mb-4">
                <label className="text-[12px] text-zinc-400 block mb-2">Minutes</label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={timerMinutes}
                  onChange={e => setTimerMinutes(Number(e.target.value))}
                  className="w-20 h-10 text-center rounded-xl bg-zinc-900/50 border border-white/[0.06] text-[18px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-sky-500/30"
                />
              </div>
            )}
            <div className="text-5xl font-mono font-bold text-white mb-6">{fmt(timerTime || timerMinutes * 60)}</div>
            <button onClick={startTimer} className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-[13px] font-medium hover:bg-sky-500 transition-colors flex items-center gap-2 mx-auto">
              {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {timerRunning ? 'Pause' : timerTime > 0 ? 'Resume' : 'Start'}
            </button>
          </div>
        )}

        {mode === 'pomodoro' && (
          <div className="text-center">
            <div className="text-sm text-zinc-400 mb-2">{pomIsBreak ? 'Break Time' : 'Focus Time'}</div>
            <div className="text-5xl font-mono font-bold text-white mb-6">{fmt(pomTime)}</div>
            <div className="text-[12px] text-zinc-500 mb-4">Focus: {pomCount.focus} | Break: {pomCount.break}</div>
            <button onClick={togglePom} className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-[13px] font-medium hover:bg-sky-500 transition-colors flex items-center gap-2 mx-auto">
              {pomRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {pomRunning ? 'Pause' : 'Start'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
