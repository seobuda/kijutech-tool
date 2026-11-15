'use client';

// Gráfica de una cifra en el tiempo (SVG propio, sin librería): una sola escala, línea de 2 px para el periodo y línea
// discontinua gris para la comparación, hitos marcados con una línea vertical, detalle al pasar el ratón o con el
// teclado, y vista en tabla para quien no pueda leer la gráfica.
import { useState } from 'react';

export type ChartPoint = { label: string; from: string; to: string; value: number | null; prev: number | null };
export type ChartMark = { date: string; title: string };

export function PerfChart({
  title,
  points,
  marks,
  format,
  compareLabel,
  height = 150
}: {
  title: string;
  points: ChartPoint[];
  marks: ChartMark[];
  format: (v: number | null) => string;
  compareLabel: string | null;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const hasPrev = points.some((p) => p.prev !== null);
  const vals = points.flatMap((p) => [p.value, hasPrev ? p.prev : null]).filter((v): v is number => v !== null);
  const max = Math.max(1, ...vals) * 1.08;
  const n = points.length;
  const W = 100;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => 100 - (v / max) * 100;
  const path = (key: 'value' | 'prev') => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      pen = true;
    });
    return d.trim();
  };
  const markIdx = marks
    .map((m) => ({ ...m, i: points.findIndex((p) => m.date >= p.from && m.date <= p.to) }))
    .filter((m) => m.i >= 0);
  const every = Math.max(1, Math.ceil(n / 7));
  const last = [...points].reverse().find((p) => p.value !== null);

  return (
    <figure className="relative min-w-0">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{title}</span>
        {hasPrev && compareLabel && (
          <span className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[var(--chart-2)]" />
              Este periodo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-muted-foreground/60" />
              {compareLabel}
            </span>
          </span>
        )}
      </figcaption>
      <div
        className="relative rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        tabIndex={0}
        aria-label={`${title}: usa las flechas para recorrer los puntos`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
          else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
          else if (e.key === 'Escape') setHover(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img" aria-label={`${title}${last ? `: último tramo ${format(last.value)}` : ''}`}>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={100 - g * 100} y2={100 - g * 100} stroke="var(--border)" strokeWidth="1" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
          ))}
          {markIdx.map((m, k) => (
            <line key={`m${k}`} x1={x(m.i)} x2={x(m.i)} y1="0" y2="100" stroke="var(--brand)" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ))}
          {hasPrev && <path d={path('prev')} fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          <path d={path('value')} fill="none" stroke="var(--chart-2)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="var(--foreground)" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          <line x1="0" x2={W} y1="100" y2="100" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Puntos en HTML para que sean redondos aunque el SVG se estire */}
        {hover !== null && points[hover].value !== null && (
          <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-[var(--chart-2)]" style={{ left: `${x(hover)}%`, top: `${y(points[hover].value!)}%` }} />
        )}
        {markIdx.map((m, k) => (
          <span key={`f${k}`} title={m.title} className="absolute -top-1 size-2 -translate-x-1/2 rounded-full bg-brand ring-2 ring-card" style={{ left: `${x(m.i)}%` }} />
        ))}
        <div className="absolute inset-0 flex">
          {points.map((p, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${Math.min(80, Math.max(20, x(hover)))}%`, transform: 'translate(-50%, calc(-100% - 6px))' }}
          >
            <div className="font-medium">{points[hover].from === points[hover].to ? points[hover].label : `${points[hover].label} – ${points[hover].to.slice(8, 10)}/${points[hover].to.slice(5, 7)}`}</div>
            <div className="text-muted-foreground">
              Este periodo: <span className="font-medium text-foreground tabular-nums">{format(points[hover].value)}</span>
            </div>
            {hasPrev && (
              <div className="text-muted-foreground">
                {compareLabel}: <span className="font-medium text-foreground tabular-nums">{format(points[hover].prev)}</span>
              </div>
            )}
            {markIdx
              .filter((m) => m.i === hover)
              .map((m, k) => (
                <div key={k} className="mt-0.5 text-brand">📌 {m.title}</div>
              ))}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex text-[10px] text-muted-foreground tabular-nums" aria-hidden>
        {points.map((p, i) => (
          <span key={i} className="flex-1 truncate text-center">
            {i % every === 0 ? p.label : ''}
          </span>
        ))}
      </div>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Ver como tabla</summary>
        <div className="max-h-56 overflow-auto">
          <table className="data-table mt-2">
            <thead>
              <tr>
                <th>Desde</th>
                <th>Este periodo</th>
                {hasPrev && <th>{compareLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td className="tabular-nums">{format(p.value)}</td>
                  {hasPrev && <td className="tabular-nums">{format(p.prev)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
