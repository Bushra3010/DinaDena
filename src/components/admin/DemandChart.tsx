'use client';

import { useState } from 'react';

type Day = { day: string; jobs: number; completed: number };
// Teal and indigo keep the two chart series distinct on light surfaces.
const SERIES = [
  { key: 'jobs' as const, label: 'Jobs posted', color: '#009caf' },
  { key: 'completed' as const, label: 'Bookings completed', color: '#6366b5' },
];

/** 7-day grouped bars with a hover tooltip; values also listed in an sr-only table. */
export function DemandChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...days.flatMap((d) => [d.jobs, d.completed]));
  const ticks = [0, Math.ceil(max / 2), max];
  const W = 560, H = 210, PAD_L = 28, PAD_B = 24, PAD_T = 10;
  const plotW = W - PAD_L, plotH = H - PAD_B - PAD_T;
  const group = plotW / days.length;
  const barW = Math.min(18, (group - 16) / 2);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const label = (d: string) => new Date(d + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Jobs posted and completed over the last 7 days">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} stroke="#e8eff3" />
              <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#5d7a9a">{t}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const x0 = PAD_L + i * group + (group - barW * 2 - 2) / 2;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD_L + i * group} y={PAD_T} width={group} height={plotH} fill={hover === i ? '#edf8fa' : 'transparent'} />
                {SERIES.map((s, k) => {
                  const v = d[s.key];
                  const h = Math.max(v ? 2 : 0, PAD_T + plotH - y(v));
                  return <path key={s.key} fill={s.color}
                    d={roundedTop(x0 + k * (barW + 2), PAD_T + plotH - h, barW, h, Math.min(4, h))} />;
                })}
                <text x={PAD_L + i * group + group / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#5d7a9a">{label(d.day)}</text>
              </g>
            );
          })}
        </svg>
        {hover != null && days[hover] && (
          <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${((PAD_L + hover * group + group / 2) / W) * 100}%`, transform: 'translateX(-50%)' }}>
            <p className="mb-1 font-semibold">{label(days[hover].day)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-sm" style={{ background: s.color }} />{s.label}: <b className="text-ink">{days[hover]![s.key]}</b></p>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <thead><tr><th>Day</th><th>Jobs posted</th><th>Completed</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.jobs}</td><td>{d.completed}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
