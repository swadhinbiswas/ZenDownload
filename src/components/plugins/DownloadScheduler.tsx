import { useState, useEffect } from 'react';
import { Clock, Play, Pause, Plus, Trash2 } from 'lucide-react';

interface ScheduledTask {
  id: string;
  name: string;
  time: string;
  days: string[];
  enabled: boolean;
  action: string;
}

export function DownloadScheduler() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([
    { id: '1', name: 'Night Download', time: '02:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], enabled: true, action: 'Resume all paused downloads' },
    { id: '2', name: 'Backup RSS', time: '06:00', days: ['Sat', 'Sun'], enabled: true, action: 'Check RSS feeds' },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({ name: '', time: '12:00', days: [] as string[], action: '' });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const addTask = () => {
    if (!newTask.name) return;
    setTasks([...tasks, { ...newTask, id: Date.now().toString(), enabled: true }]);
    setNewTask({ name: '', time: '12:00', days: [], action: '' });
    setShowAdd(false);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const toggleDay = (day: string) => {
    setNewTask(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day],
    }));
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Download Scheduler</h2>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/10 text-violet-400 text-[12px] font-medium hover:bg-violet-600/20 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Task
          </button>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/[0.06] mb-6 text-center">
          <div className="text-4xl font-mono font-bold text-white mb-1">
            {currentTime.toLocaleTimeString('en-US', { hour12: false })}
          </div>
          <div className="text-sm text-zinc-400">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {showAdd && (
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/[0.06] mb-4">
            <div className="space-y-3">
              <input
                type="text"
                value={newTask.name}
                onChange={e => setNewTask({ ...newTask, name: e.target.value })}
                placeholder="Task name"
                className="w-full h-9 px-3 rounded-lg bg-zinc-950 border border-white/[0.06] text-[13px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
              />
              <input
                type="time"
                value={newTask.time}
                onChange={e => setNewTask({ ...newTask, time: e.target.value })}
                className="w-full h-9 px-3 rounded-lg bg-zinc-950 border border-white/[0.06] text-[13px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
              />
              <div>
                <span className="text-[11px] text-zinc-500 mb-1 block">Repeat on:</span>
                <div className="flex gap-1">
                  {DAY_NAMES.map(day => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`w-9 h-9 rounded-lg text-[11px] font-medium transition-colors ${
                        newTask.days.includes(day)
                          ? 'bg-violet-600 text-white'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={newTask.action}
                onChange={e => setNewTask({ ...newTask, action: e.target.value })}
                placeholder="Action (e.g., Resume all downloads)"
                className="w-full h-9 px-3 rounded-lg bg-zinc-950 border border-white/[0.06] text-[13px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg text-[12px] text-zinc-400 hover:text-zinc-300">Cancel</button>
                <button onClick={addTask} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-violet-600 text-white hover:bg-violet-500">Save</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-zinc-900/30 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
              <button
                onClick={() => toggleTask(task.id)}
                className={`p-2 rounded-lg transition-colors ${task.enabled ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-600 hover:bg-white/[0.06]'}`}
              >
                {task.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-zinc-200">{task.name}</span>
                  <span className="text-[11px] font-mono text-zinc-500">{task.time}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {task.days.map(d => (
                    <span key={d} className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-500">{d}</span>
                  ))}
                </div>
                {task.action && <p className="text-[11px] text-zinc-600 mt-1">{task.action}</p>}
              </div>
              <button onClick={() => deleteTask(task.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
