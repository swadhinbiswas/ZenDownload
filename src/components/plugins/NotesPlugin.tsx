import { useState, useEffect } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';

interface Note {
  id: string;
  title: string;
  content: string;
  updated: number;
}

export function NotesPlugin() {
  const [notes, setNotes] = useState<Note[]>(() => {
    try { return JSON.parse(localStorage.getItem('zenplugin_notes') || '[]'); } catch { return []; }
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = notes.find(n => n.id === activeId);

  useEffect(() => {
    localStorage.setItem('zenplugin_notes', JSON.stringify(notes));
  }, [notes]);

  const addNote = () => {
    const note: Note = { id: Date.now().toString(), title: 'Untitled', content: '', updated: Date.now() };
    setNotes([note, ...notes]);
    setActiveId(note.id);
  };

  const updateNote = (id: string, changes: Partial<Note>) => {
    setNotes(notes.map(n => n.id === id ? { ...n, ...changes, updated: Date.now() } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
    if (activeId === id) setActiveId(null);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-64 border-r border-white/[0.04] flex flex-col shrink-0">
        <div className="flex items-center justify-between p-3 border-b border-white/[0.04]">
          <span className="text-[13px] font-medium text-zinc-300">Notes</span>
          <button onClick={addNote} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-300 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {notes.map(note => (
            <div
              key={note.id}
              onClick={() => setActiveId(note.id)}
              className={`px-3 py-2 cursor-pointer border-b border-white/[0.04] transition-colors ${
                activeId === note.id ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'
              }`}
            >
              <div className="text-[12px] font-medium text-zinc-300 truncate">{note.title || 'Untitled'}</div>
              <div className="text-[10px] text-zinc-600 truncate mt-0.5">{note.content.slice(0, 40) || 'Empty'}</div>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="p-4 text-center text-zinc-600 text-[12px]">No notes yet</div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {active ? (
          <>
            <div className="p-3 border-b border-white/[0.04] flex items-center gap-2">
              <input
                type="text"
                value={active.title}
                onChange={e => updateNote(active.id, { title: e.target.value })}
                className="flex-1 bg-transparent text-[14px] font-medium text-white focus:outline-none"
                placeholder="Note title"
              />
              <button onClick={() => deleteNote(active.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={active.content}
              onChange={e => updateNote(active.id, { content: e.target.value })}
              className="flex-1 p-4 bg-transparent text-[13px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none resize-none font-mono"
              placeholder="Write your notes here..."
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3" />
              <p className="text-sm">Select a note or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
