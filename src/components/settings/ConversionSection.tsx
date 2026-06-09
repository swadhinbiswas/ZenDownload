import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Zap, Settings } from 'lucide-react';

interface ConversionPreset {
  id: string;
  name: string;
  input_types: string[];
  output_ext: string;
  ffmpeg_args: string[];
  is_builtin: boolean;
}

interface ConversionSectionProps {
  onSettingsChange?: () => void;
}

export function ConversionSection({ onSettingsChange }: ConversionSectionProps) {
  const [presets, setPresets] = useState<ConversionPreset[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('mp4_h264');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<ConversionPreset[]>('get_conversion_presets').then(setPresets).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('save_runtime_settings', {
        input: {
          autoConvertEnabled: enabled,
          defaultConversionPreset: selectedPreset,
        },
      });
      onSettingsChange?.();
    } finally {
      setSaving(false);
    }
  };

  const videoPresets = presets.filter(p => ['mp4', 'mkv', 'webm', 'avi'].some(ext => p.output_ext === ext));
  const audioPresets = presets.filter(p => ['mp3', 'm4a', 'flac', 'opus', 'ogg'].some(ext => p.output_ext === ext));
  const otherPresets = presets.filter(p => !videoPresets.includes(p) && !audioPresets.includes(p));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-zinc-200">Auto-Conversion</h3>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-zinc-700'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>

      {enabled && (
        <>
          <p className="text-xs text-zinc-500">
            Automatically convert downloaded files to your preferred format using ffmpeg.
          </p>

          {videoPresets.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Video</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {videoPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                      selectedPreset === preset.id
                        ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300'
                        : 'bg-zinc-900/50 border border-white/[0.04] text-zinc-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-[10px] text-zinc-600 block mt-0.5">
                      → .{preset.output_ext}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {audioPresets.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Audio</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {audioPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                      selectedPreset === preset.id
                        ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300'
                        : 'bg-zinc-900/50 border border-white/[0.04] text-zinc-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-[10px] text-zinc-600 block mt-0.5">
                      → .{preset.output_ext}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {otherPresets.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Other</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {otherPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                      selectedPreset === preset.id
                        ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300'
                        : 'bg-zinc-900/50 border border-white/[0.04] text-zinc-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-[10px] text-zinc-600 block mt-0.5">
                      → .{preset.output_ext}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/30 border border-white/[0.04]">
            <Settings className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-500">
              Requires ffmpeg installed on your system
            </span>
          </div>
        </>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
