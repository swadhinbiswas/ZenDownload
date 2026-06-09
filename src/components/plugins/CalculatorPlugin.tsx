import { useState } from 'react';
import { Calculator as CalcIcon } from 'lucide-react';

export function CalculatorPlugin() {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');

  const handleBtn = (val: string) => {
    if (val === 'C') { setExpression(''); setDisplay('0'); return; }
    if (val === '⌫') { setExpression(expression.slice(0, -1)); setDisplay(expression.slice(0, -1) || '0'); return; }
    if (val === '=') {
      try {
        const result = new Function('return ' + expression.replace(/×/g, '*').replace(/÷/g, '/'))();
        setDisplay(isFinite(result) ? String(result) : 'Error');
        setExpression(isFinite(result) ? String(result) : '');
      } catch { setDisplay('Error'); }
      return;
    }
    setExpression(expression + val);
    setDisplay(expression + val);
  };

  const btns = [
    ['C', '(', ')', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '⌫', '='],
  ];

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="max-w-xs mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <CalcIcon className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-white">Calculator</h2>
        </div>

        <div className="mb-4 p-4 rounded-xl bg-zinc-900/50 border border-white/[0.06] text-right">
          <div className="text-3xl font-mono font-bold text-white truncate">{display}</div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {btns.flat().map((btn, i) => (
            <button
              key={i}
              onClick={() => handleBtn(btn)}
              className={`h-12 rounded-xl text-[14px] font-medium transition-colors ${
                btn === '=' ? 'bg-indigo-600 text-white hover:bg-indigo-500' :
                ['÷', '×', '-', '+'].includes(btn) ? 'bg-zinc-700 text-orange-400 hover:bg-zinc-600' :
                ['C', '⌫'].includes(btn) ? 'bg-zinc-800 text-red-400 hover:bg-zinc-700' :
                'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              {btn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
