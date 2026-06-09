import { Palette, Check } from 'lucide-react';

interface ThemeSectionProps {
  accent: string;
  fontSize?: string;
  compactMode?: boolean;
  backgroundDensity?: string;
  onChange: (patch: {
    themeAccent?: string;
    themeFontSize?: string;
    themeCompactMode?: boolean;
    themeBackgroundDensity?: string;
  }) => void;
}

const ACCENTS = [
  { id: 'indigo', name: 'Indigo', color: '#6366f1' },
  { id: 'blue', name: 'Blue', color: '#3b82f6' },
  { id: 'purple', name: 'Purple', color: '#a855f7' },
  { id: 'pink', name: 'Pink', color: '#ec4899' },
  { id: 'red', name: 'Red', color: '#ef4444' },
  { id: 'orange', name: 'Orange', color: '#f97316' },
  { id: 'amber', name: 'Amber', color: '#f59e0b' },
  { id: 'emerald', name: 'Emerald', color: '#10b981' },
  { id: 'teal', name: 'Teal', color: '#14b8a6' },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4' },
  { id: 'slate', name: 'Slate', color: '#64748b' },
  { id: 'zinc', name: 'Zinc', color: '#71717a' },
];

const FONT_SIZES = [
  { id: 'small', name: 'Small', label: '13px' },
  { id: 'default', name: 'Default', label: '14px' },
  { id: 'large', name: 'Large', label: '16px' },
];

const DENSITIES = [
  { id: 'default', name: 'Default', desc: 'Standard background opacity' },
  { id: 'glass', name: 'Glass', desc: 'Frosted glass blur effect' },
  { id: 'transparent', name: 'Transparent', desc: 'Minimal backgrounds, more see-through' },
];

export function ThemeSection({
  accent,
  fontSize = 'default',
  compactMode = false,
  backgroundDensity = 'default',
  onChange,
}: ThemeSectionProps) {
  return (
    <div className="space-y-6">
      {/* Accent Colors */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-5 h-5 text-zinc-400" />
          <h3 className="text-xl font-bold text-white tracking-tight">Theme Accent</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-4">Choose the color used for highlights, buttons, and active states.</p>
        <div className="grid grid-cols-6 gap-2 max-w-md">
          {ACCENTS.map((c) => (
            <button
              key={c.id}
              onClick={() => onChange({ themeAccent: c.id })}
              className="group relative h-12 rounded-xl border border-white/[0.06] hover:border-white/20 transition-all overflow-hidden"
              style={{ backgroundColor: c.color + '20' }}
              title={c.name}
            >
              <div
                className="absolute inset-1.5 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: c.color }}
              >
                {accent === c.id && <Check className="w-4 h-4 text-white" />}
              </div>
              <span className="sr-only">{c.name}</span>
            </button>
          ))}
        </div>
        <div className="text-xs text-zinc-500 mt-2">
          Current: <span className="text-zinc-300 font-medium">{ACCENTS.find((c) => c.id === accent)?.name || 'Indigo'}</span>
        </div>
      </div>

      {/* Font Size */}
      <div>
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">Font Size</h4>
        <p className="text-xs text-zinc-500 mb-3">Affects all semantic text (headings, body, labels). Custom pixel sizes are not affected.</p>
        <div className="flex gap-2">
          {FONT_SIZES.map((fs) => (
            <button
              key={fs.id}
              onClick={() => onChange({ themeFontSize: fs.id })}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                fontSize === fs.id
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                  : 'border-white/[0.06] text-zinc-400 hover:border-white/20 hover:text-zinc-300'
              }`}
            >
              {fs.name} ({fs.label})
            </button>
          ))}
        </div>
      </div>

      {/* Compact Mode */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-zinc-300">Compact Mode</h4>
            <p className="text-xs text-zinc-500 mt-0.5">Reduce padding and spacing for more content density</p>
          </div>
          <button
            onClick={() => onChange({ themeCompactMode: !compactMode })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              compactMode ? 'bg-indigo-500' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                compactMode ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Background Density */}
      <div>
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">Background Density</h4>
        <p className="text-xs text-zinc-500 mb-3">Adjust background opacity and effects.</p>
        <div className="flex flex-col gap-2 max-w-sm">
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              onClick={() => onChange({ themeBackgroundDensity: d.id })}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                backgroundDensity === d.id
                  ? 'bg-indigo-500/10 border-indigo-500/30'
                  : 'border-white/[0.06] hover:border-white/20'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                backgroundDensity === d.id ? 'border-indigo-400' : 'border-zinc-600'
              }`}>
                {backgroundDensity === d.id && <div className="w-2 h-2 rounded-full bg-indigo-400" />}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">{d.name}</p>
                <p className="text-xs text-zinc-500">{d.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
