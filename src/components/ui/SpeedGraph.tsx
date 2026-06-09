import { useEffect, useRef } from 'react';

interface SpeedGraphProps {
  totalSpeed: number;
  className?: string;
}

const HISTORY_LENGTH = 120; // 2 minutes at 1s intervals
const CANVAS_WIDTH = 200;
const CANVAS_HEIGHT = 32;

export function SpeedGraph({ totalSpeed, className = '' }: SpeedGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const maxSpeedRef = useRef(1);

  useEffect(() => {
    historyRef.current.push(totalSpeed);
    if (historyRef.current.length > HISTORY_LENGTH) {
      historyRef.current.shift();
    }

    // Update max for scaling (with decay so graph adapts to slower speeds)
    if (totalSpeed > maxSpeedRef.current) {
      maxSpeedRef.current = totalSpeed;
    } else {
      maxSpeedRef.current *= 0.995;
    }
    if (maxSpeedRef.current < 1) maxSpeedRef.current = 1;

    drawGraph();
  }, [totalSpeed]);

  function drawGraph() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = historyRef.current;
    const max = maxSpeedRef.current;
    const w = CANVAS_WIDTH;
    const h = CANVAS_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) return;

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let i = 0; i < data.length; i++) {
      const x = (i / (HISTORY_LENGTH - 1)) * w;
      const y = h - (data[i] / max) * (h - 2);
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        // Smooth curve
        const prevX = ((i - 1) / (HISTORY_LENGTH - 1)) * w;
        const prevY = h - (data[i - 1] / max) * (h - 2);
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    }

    ctx.lineTo(((data.length - 1) / (HISTORY_LENGTH - 1)) * w, h);
    ctx.closePath();

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.02)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line on top
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (HISTORY_LENGTH - 1)) * w;
      const y = h - (data[i] / max) * (h - 2);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevX = ((i - 1) / (HISTORY_LENGTH - 1)) * w;
        const prevY = h - (data[i - 1] / max) * (h - 2);
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    }
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw current speed dot
    if (data.length > 0) {
      const lastX = ((data.length - 1) / (HISTORY_LENGTH - 1)) * w;
      const lastY = h - (data[data.length - 1] / max) * (h - 2);
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#818cf8';
      ctx.fill();
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className={`rounded ${className}`}
      style={{ imageRendering: 'auto' }}
    />
  );
}
