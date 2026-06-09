import { useState } from 'react';
import { Shield, Copy, RefreshCw } from 'lucide-react';

export function PasswordGenPlugin() {
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const CHARS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    nums: '0123456789',
    syms: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  };

  const generate = () => {
    let chars = '';
    if (uppercase) chars += CHARS.upper;
    if (lowercase) chars += CHARS.lower;
    if (numbers) chars += CHARS.nums;
    if (symbols) chars += CHARS.syms;
    if (!chars) chars = CHARS.lower + CHARS.nums;

    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    setPassword(Array.from(arr, x => chars[x % chars.length]).join(''));
    setCopied(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const strength = (() => {
    let s = 0;
    if (length >= 8) s++;
    if (length >= 12) s++;
    if (length >= 20) s++;
    if (uppercase && lowercase) s++;
    if (numbers) s++;
    if (symbols) s++;
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['text-red-400', 'text-red-400', 'text-amber-400', 'text-amber-400', 'text-emerald-400', 'text-emerald-400'];
    return { label: labels[Math.min(s, 5)], color: colors[Math.min(s, 5)], score: s };
  })();

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="max-w-sm mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Password Generator</h2>
        </div>

        <div className="relative mb-4">
          <input
            type="text"
            value={password}
            readOnly
            placeholder="Click Generate"
            className="w-full h-12 px-4 pr-20 rounded-xl bg-zinc-900/50 border border-white/[0.06] text-[14px] font-mono text-white focus:outline-none"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            {password && (
              <button onClick={copy} className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-300 transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {password && (
          <div className="mb-4 text-center">
            <span className={`text-[12px] font-medium ${strength.color}`}>Strength: {strength.label}</span>
          </div>
        )}

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <label className="text-[12px] text-zinc-400">Length: <span className="text-zinc-300 font-mono">{length}</span></label>
            <input
              type="range"
              min="4"
              max="64"
              value={length}
              onChange={e => setLength(Number(e.target.value))}
              className="w-40 accent-indigo-500"
            />
          </div>

          {[
            { label: 'Uppercase (A-Z)', checked: uppercase, set: setUppercase },
            { label: 'Lowercase (a-z)', checked: lowercase, set: setLowercase },
            { label: 'Numbers (0-9)', checked: numbers, set: setNumbers },
            { label: 'Symbols (!@#$)', checked: symbols, set: setSymbols },
          ].map(opt => (
            <label key={opt.label} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={opt.checked}
                onChange={e => opt.set(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-500"
              />
              <span className="text-[12px] text-zinc-300">{opt.label}</span>
            </label>
          ))}
        </div>

        <button
          onClick={generate}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-medium hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Generate
        </button>

        {copied && (
          <div className="mt-3 text-center text-[12px] text-emerald-400">Copied to clipboard!</div>
        )}
      </div>
    </div>
  );
}
