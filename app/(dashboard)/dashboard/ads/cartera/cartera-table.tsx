'use client';

// Tabla de la Cartera de Google Ads: una fila por cuenta seguida, ordenable por cualquier columna. En gris lo que no se
// pudo comprobar (MED-00). Las cifras van en la moneda de cada cuenta: nunca se suman entre monedas.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/page';
import type { PortfolioRow } from '@/lib/ads/views';

type Key = 'name' | 'client' | 'spent' | 'pace' | 'cpl' | 'conv7' | 'measurement' | 'findings' | 'audit' | 'change' | 'review' | 'next';

const ACTOR: Record<string, string> = { agencia: 'agencia', cliente: 'cliente', google: 'Google', herramienta: 'herramienta', desconocido: '—' };
const MEAS: Record<PortfolioRow['measurement'], { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning' }> = {
  sana: { label: 'sana', tone: 'success' },
  rota: { label: 'rota', tone: 'danger' },
  sin_datos: { label: 'sin datos para afirmar', tone: 'neutral' },
  no_comprobado: { label: 'no comprobada', tone: 'warning' },
  sin_evaluar: { label: 'sin evaluar', tone: 'neutral' }
};
const MEAS_ORDER: Record<PortfolioRow['measurement'], number> = { rota: 0, no_comprobado: 1, sin_evaluar: 2, sin_datos: 3, sana: 4 };
const money = (v: number | null, cur: string | null) => {
  if (v === null) return '—';
  try {
    return v.toLocaleString('es-ES', { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: v >= 100 ? 0 : 2 });
  } catch {
    return v.toFixed(2);
  }
};
const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }) : '—');

function value(r: PortfolioRow, k: Key): string | number {
  switch (k) {
    case 'name':
      return r.name.toLowerCase();
    case 'client':
      return `${r.level ?? 'Z'}${(r.clientName ?? 'zzz').toLowerCase()}`;
    case 'spent':
      return r.spentMonth;
    case 'pace':
      return r.paceRatio ?? -1;
    case 'cpl':
      return r.cpl30 !== null && r.target ? r.cpl30 / r.target.value : (r.cpl30 ?? -1);
    case 'conv7':
      return r.conv7;
    case 'measurement':
      return MEAS_ORDER[r.measurement];
    case 'findings':
      return r.urgentFindings * 1000 + r.openFindings;
    case 'audit':
      // Primero lo que reapareció, luego lo pendiente (sin auditar o por leer) con más «mal».
      return r.audit.regressed * 10_000 + (r.audit.state === 'leida' ? 0 : 1000) + (r.audit.state === 'sin_auditar' ? 500 : 0) + r.audit.pending;
    case 'change':
      return r.lastChange?.at ?? '';
    case 'review':
      return r.lastReview?.at ?? '';
    case 'next':
      return r.nextReview ?? '0000';
  }
}

export function CarteraTable({ rows }: { rows: PortfolioRow[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'findings', dir: -1 });
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  }), [rows, sort]);
  const th = (k: Key, label: string, right = false) => {
    const active = sort.key === k;
    const Icon = active ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={`px-3 py-2 font-medium ${right ? 'text-right' : ''}`} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : -1 })}>
          {label} <Icon className="size-3" aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div className="-m-5 overflow-x-auto">
      <table className="w-full min-w-[1220px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            {th('name', 'Cuenta')}
            {th('client', 'Cliente y nivel')}
            {th('spent', 'Gasto del mes', true)}
            {th('pace', 'Ritmo', true)}
            {th('cpl', 'CPL 30 días', true)}
            {th('conv7', 'Conv. 7 días', true)}
            {th('measurement', 'Medición')}
            {th('findings', 'Hallazgos', true)}
            {th('audit', 'Auditoría')}
            {th('change', 'Último cambio')}
            {th('review', 'Última revisión')}
            {th('next', 'Próxima')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const gray = !r.checked;
            const pct = r.paceRatio !== null ? Math.round((r.paceRatio - 1) * 100) : null;
            return (
              <tr key={r.accountId} className={gray ? 'border-b bg-muted/40 text-muted-foreground' : 'border-b'} title={gray ? `Sin comprobar: ${r.problems.join(', ')}` : undefined}>
                <td className="px-3 py-2.5">
                  <Link href={`/dashboard/ads/cuentas/${r.accountId}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {r.customerIdLabel}
                    {gray && <span className="ml-1">· sin comprobar</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {r.clientName ? <span>{r.clientName}</span> : <span className="text-muted-foreground">{r.simulated ? 'simulada' : 'sin vincular'}</span>}
                  {r.level ? <Badge className="ml-1.5" tone="outline">Nivel {r.level}</Badge> : r.clientName ? <span className="ml-1.5 text-xs text-muted-foreground">sin nivel</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(r.spentMonth, r.currency)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" title={r.reference ? `Proyección ${money(r.projection, r.currency)} frente a ${money(r.reference.amount, r.currency)} (${r.reference.mode === 'acuerdo' ? 'presupuesto acordado' : 'suma de presupuestos'})` : 'Sin presupuesto de referencia'}>
                  {pct === null ? '—' : (
                    <span className={Math.abs(pct) > 10 ? 'font-medium text-warning-strong' : ''}>
                      {pct > 0 ? '+' : ''}
                      {pct} %
                    </span>
                  )}
                  <div className="text-xs text-muted-foreground">{r.reference ? (r.reference.mode === 'acuerdo' ? 'vs. acordado' : 'vs. presupuestos') : ''}{!r.paceComplete ? ' · faltan días' : ''}</div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {money(r.cpl30, r.currency)}
                  <div className="text-xs text-muted-foreground">
                    {r.target ? (r.target.kind === 'linea_base' ? `frente a su línea base ${money(r.target.value, r.currency)}, sin objetivo de negocio` : `objetivo ${r.target.kind === 'provisional' ? 'provisional ' : ''}${money(r.target.value, r.currency)}`) : 'sin referencia'}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.conv7.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={MEAS[r.measurement].tone} title={r.measurementNote ?? undefined}>
                    {MEAS[r.measurement].label}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.openFindings === 0 ? '0' : (
                    <span>
                      {r.openFindings}
                      {r.urgentFindings > 0 && <Badge className="ml-1" tone="danger">{r.urgentFindings} urgente{r.urgentFindings > 1 ? 's' : ''}</Badge>}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {r.audit.state === 'sin_auditar' ? (
                    <Badge tone="neutral" title="La auditoría de higiene se hace sola cuando la cuenta tiene sus datos; también desde la cuenta.">pendiente · sin auditar</Badge>
                  ) : r.audit.state === 'por_leer' ? (
                    <Badge tone="warning" title={`Auditoría del ${day(r.audit.at)}: falta leerla`}>pendiente · {r.audit.pending} mal</Badge>
                  ) : (
                    <Badge tone={r.audit.pending ? 'outline' : 'success'} title={`Auditoría del ${day(r.audit.at)}, leída`}>hecha{r.audit.pending ? ` · ${r.audit.pending} abiertos` : ''}</Badge>
                  )}
                  {r.audit.regressed > 0 && <Badge className="ml-1" tone="danger">{r.audit.regressed} reapareció</Badge>}
                  {r.audit.confirmar > 0 && <div className="mt-0.5 text-muted-foreground">{r.audit.confirmar} por confirmar en la ficha</div>}
                </td>
                <td className="px-3 py-2.5 text-xs">{r.lastChange ? `${day(r.lastChange.at)} · ${ACTOR[r.lastChange.actor] ?? r.lastChange.actor}${r.lastChange.email ? ` (${r.lastChange.email})` : ''}` : '—'}</td>
                <td className="px-3 py-2.5 text-xs">{r.lastReview ? `${day(r.lastReview.at)}${r.lastReview.by ? ` · ${r.lastReview.by}` : ''}` : <span className="text-muted-foreground">nunca</span>}</td>
                <td className="px-3 py-2.5 text-xs">{r.reviewOverdue ? <Badge tone="warning">{r.nextReview ? `vencida (${day(r.nextReview)})` : 'pendiente'}</Badge> : day(r.nextReview)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
