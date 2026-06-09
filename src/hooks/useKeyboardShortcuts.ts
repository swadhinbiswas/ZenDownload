import { useEffect } from 'react';

interface ShortcutHandlers {
  onAddDownload?: () => void;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
  onOpenSettings?: () => void;
  onToggleQueue?: () => void;
  onDeleteSelected?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Don't intercept keyboard shortcuts when typing in inputs
      if (isInput) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Ctrl+N / Cmd+N — Add new download
      if (ctrl && e.key === 'n') {
        e.preventDefault();
        handlers.onAddDownload?.();
        return;
      }

      // Ctrl+P / Cmd+P — Open settings (Preferences)
      if (ctrl && e.key === ',') {
        e.preventDefault();
        handlers.onOpenSettings?.();
        return;
      }

      // Ctrl+Shift+P / Cmd+Shift+P — Pause all
      if (ctrl && shift && e.key === 'P') {
        e.preventDefault();
        handlers.onPauseAll?.();
        return;
      }

      // Ctrl+Shift+R / Cmd+Shift+R — Resume all
      if (ctrl && shift && e.key === 'R') {
        e.preventDefault();
        handlers.onResumeAll?.();
        return;
      }

      // Ctrl+Q / Cmd+Q — Toggle queue view
      if (ctrl && e.key === 'q') {
        e.preventDefault();
        handlers.onToggleQueue?.();
        return;
      }

      // Delete / Backspace — Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handlers.onDeleteSelected?.();
        return;
      }

      // Ctrl+A / Cmd+A — Select all
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        handlers.onSelectAll?.();
        return;
      }

      // Escape — Clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.onClearSelection?.();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

export const SHORTCUT_HELP = [
  { keys: ['Ctrl', 'N'], description: 'New download' },
  { keys: ['Ctrl', ','], description: 'Open settings' },
  { keys: ['Ctrl', 'Shift', 'P'], description: 'Pause all downloads' },
  { keys: ['Ctrl', 'Shift', 'R'], description: 'Resume all downloads' },
  { keys: ['Ctrl', 'Q'], description: 'Toggle queue' },
  { keys: ['Delete'], description: 'Delete selected' },
  { keys: ['Ctrl', 'A'], description: 'Select all' },
  { keys: ['Escape'], description: 'Clear selection' },
];
