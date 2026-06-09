import { useState } from 'react';
import { Palette, Copy } from 'lucide-react';

export function ColorPickerPlugin() {
  const [color, setColor] = useState('#6366f1');
  const [copied, setCopied] = useState('');

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };

  const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const { r, g, b } = hexToRgb(color);
  const hsl = rgbToHsl(r, g, b);

  const copyColor = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(val);
    setTimeout(() => setCopied(''), 1500);
  };

  const palette = Array.from({ length: 9 }, (_, i) => {
    const l = Math.round(10 + (i * 80 / 8));
    return `hsl(${hsl.h}, ${hsl.s}%, ${l}%)`;
  });

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="max-w-sm mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <Palette className="w-5 h-5 text-pink-400" />
          <h2 className="text-lg font-semibold text-white">Color Picker</h2>
        </div>

        <div className="flex gap-4 mb-6">
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-20 h-20 rounded-xl cursor-pointer border-2 border-white/10"
          />
          <div className="flex-1 space-y-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">HEX</label>
              <input
                type="text"
                value={color}
                onChange={e => /^#[0-9a-f]{6}$/i.test(e.target.value) && setColor(e.target.value)}
                className="w-full h-8 px-2 rounded-lg bg-zinc-900/50 border border-white/[0.06] text-[12px] font-mono text-zinc-300 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">R</label>
                <input type="number" value={r} readOnly className="w-full h-8 px-2 rounded-lg bg-zinc-900/50 border border-white/[0.06] text-[12px] text-zinc-300" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">G</label>
                <input type="number" value={g} readOnly className="w-full h-8 px-2 rounded-lg bg-zinc-900/50 border border-white/[0.06] text-[12px] text-zinc-300" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">B</label>
                <input type="number" value={b} readOnly className="w-full h-8 px-2 rounded-lg bg-zinc-900/50 border border-white/[0.06] text-[12px] text-zinc-300" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          {[
            { label: 'HEX', value: color },
            { label: 'RGB', value: `rgb(${r}, ${g}, ${b})` },
            { label: 'HSL', value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 w-8">{c.label}</span>
              <code className="flex-1 text-[11px] font-mono text-zinc-400 bg-zinc-900/50 px-2 py-1.5 rounded-lg">{c.value}</code>
              <button onClick={() => copyColor(c.value)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {copied && <div className="text-center text-[12px] text-emerald-400 mb-4">Copied {copied}</div>}

        <div>
          <span className="text-[11px] text-zinc-500 mb-2 block">Palette</span>
          <div className="flex gap-1.5">
            {palette.map((c, i) => (
              <div
                key={i}
                onClick={() => {
                  const canvas = document.createElement('canvas');
                  canvas.width = 1; canvas.height = 1;
                  const ctx = canvas.getContext('2d')!;
                  ctx.fillStyle = c;
                  ctx.fillRect(0, 0, 1, 1);
                  const [r2, g2, b2] = ctx.getImageData(0, 0, 1, 1).data;
                  setColor(`#${[r2, g2, b2].map(x => x.toString(16).padStart(2, '0')).join('')}`);
                }}
                className="w-8 h-8 rounded-lg cursor-pointer hover:scale-110 transition-transform border border-white/10"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
