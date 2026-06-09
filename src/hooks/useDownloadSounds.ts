import { useEffect, useRef } from 'react';
import { useDownloadStore } from '../stores/downloadStore';
import { useSettingsStore } from '../stores/settingsStore';

// Generate a pleasant completion chime using Web Audio API
function playCompletionSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Two-tone ascending chime
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.5);
    });
  } catch {
    // Audio not available
  }
}

function playErrorSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.3);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // Audio not available
  }
}

export function useDownloadSounds() {
  const prevStatusRef = useRef(new Map<string, string>());

  const downloads = useDownloadStore(state => state.downloads);
  const soundsEnabled = useSettingsStore(state => state.osNotifications);

  useEffect(() => {
    if (!soundsEnabled) return;

    for (const download of downloads) {
      const prevStatus = prevStatusRef.current.get(download.id);
      if (prevStatus && prevStatus !== download.status) {
        if (download.status === 'Completed' && prevStatus !== 'Completed') {
          playCompletionSound();
        } else if (download.status === 'Error' && prevStatus !== 'Error') {
          playErrorSound();
        }
      }
      prevStatusRef.current.set(download.id, download.status);
    }
  }, [downloads, soundsEnabled]);
}
