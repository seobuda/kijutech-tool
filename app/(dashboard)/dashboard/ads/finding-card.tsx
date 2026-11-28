'use client';

// Un hallazgo de Google Ads con su evidencia, los días que lleva abierto y las respuestas del gestor (investigación 7.4).
// Las respuestas que lo necesitan piden motivo, fecha o días antes de guardar; después se dice qué pasa con el hallazgo
// y la página se recarga. Quien solo puede ver (lector) ve el hallazgo sin botones.
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { respondAdsFindingAction } from '@/lib/ads/actions';
import type { FindingView } from '@/lib/ads/views';

type ResponseKey = 'hecho' | 'lo_hago_yo' | 'esperando_cliente' | 'cliente_lo_quiere' | 'ya_lo_sabia' | 'no_es_problema' | 'posponer' | 'encargar';
const OPTIONS: { key: ResponseKey; label: string; needs?: 'reason' | 'until' | 'days' | 'untilOptional'; hint: string }[] = [
  { key: 'hecho', label: 'Hecho', hint: 'Ya está arreglado: se comprueba solo y se cierra cuando deje de verse.' },
  { key: 'lo_hago_yo', label: 'Lo hago yo', hint: 'Lo arreglas tú en Google Ads; se comprueba solo.' },
  { key: 'esperando_cliente', label: 'Esperando al cliente', needs: 'until', hint: 'Pasa a «esperando a terceros» hasta la fecha que pongas.' },
  { key: 'encargar', label: 'Encargar', needs: 'untilOptional', hint: 'Crea un encargo para el cliente (si la cuenta tiene cliente vinculado) y lo silencia hasta su entrega.' },
  { key: 'cliente_lo_quiere', label: 'El cliente lo quiere así', needs: 'reason', hint: 'Escribe en una frase qué quiere el cliente: no se vuelve a avisar de esta causa en un año.' },
  { key: 'no_es_problema', label: 'No es un problema', needs: 'reason', hint: 'Explica por qué: no se vuelve a avisar de esta causa en 90 días.' },
  { key: 'ya_lo_sabia', label: 'Ya lo sabía', hint: 'No cambia ningún umbral; se silencia 7 días.' },
  { key: 'posponer', label: 'Posponer', needs: 'days', hint: '1, 7 o 28 días; como mucho dos veces.' }
];

const SEVERITY_TONE = { alta: 'danger', media: 'warning', baja: 'neutral' } as const;
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' });
const money = (v: number, cur: string | null) => {
  try {
    return v.toLocaleString('es-ES', { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: v >= 100 ? 0 : 2 });
  } catch {
    return v.toFixed(2);
  }
};

export function FindingCard({ f, canEdit, showAccount = true }: { f: FindingView; canEdit: boolean; showAccount?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<ResponseKey | null>(null);
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [days, setDays] = useState('7');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null);
  const live = f.status === 'abierto' || f.status === 'silenciado';
  const option = OPTIONS.find((o) => o.key === open);

  const send = (key: ResponseKey) =>
    start(async () => {
      const r = await respondAdsFindingAction(f.id, key, { reason: reason || null, until: until || null, days: key === 'posponer' ? Number(days) : null });
      if (r.ok) {
        setMsg({ ok: true, text: r.message, url: r.taskUrl });
        setOpen(null);
        setReason('');
        setUntil('');
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });

  const choose = (key: ResponseKey) => {
    setMsg(null);
    const o = OPTIONS.find((x) => x.key === key)!;
    if (!o.needs) send(key);
    else setOpen(open === key ? null : key);
  };

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone={SEVERITY_TONE[f.severity as keyof typeof SEVERITY_TONE] ?? 'neutral'}>
              {f.kindN}. {f.kindLabel}
            </Badge>
            {f.fyi && <Badge tone="info">Para que lo sepas</Badge>}
            {f.recipient === 'tecnico' && <Badge tone="outline">Responsable técnico</Badge>}
            {f.overdue && <Badge tone="danger">Vencido</Badge>}
            {f.status === 'resuelto' && <Badge tone="success">Resuelto{f.resolvedAt ? ` el ${fmtDay(f.resolvedAt)}` : ''}</Badge>}
            {f.status === 'descartado' && <Badge tone="neutral">Descartado</Badge>}
            {f.status === 'silenciado' && !f.overdue && f.silencedUntil && <Badge tone="neutral">Silenciado hasta el {fmtDay(f.silencedUntil)}</Badge>}
            {f.uncheckedSince && live && <Badge tone="warning" title="La regla no se pudo comprobar (fuente sin datos o día sin completar): no se cierra a ciegas.">Sin comprobar desde {fmtDate(f.uncheckedSince)}</Badge>}
          </div>
          <h3 className="text-sm font-semibold text-pretty">{f.title}</h3>
          {showAccount && (f.accountName || f.campaignName) && (
            <p className="text-xs text-muted-foreground">
              {f.accountId ? (
                <Link className="underline-offset-2 hover:underline" href={`/dashboard/ads/cuentas/${f.accountId}`}>
                  {f.accountName}
                </Link>
              ) : (
                f.accountName
              )}
              {f.campaignName ? ` · ${f.campaignName}` : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden /> {f.daysOpen === 0 ? 'abierto hoy' : `${f.daysOpen} día${f.daysOpen > 1 ? 's' : ''} abierto`}
          </span>
          {f.exposure !== null && <span>{money(f.exposure, f.currency)} expuestos al día</span>}
        </div>
      </div>

      {f.lines.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {f.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {f.related.length > 0 && <p className="mt-2 text-xs text-muted-foreground">También visto (queda dentro de este, que manda): {f.related.join(' · ')}</p>}

      {f.responses.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {f.responses.map((r, i) => (
            <li key={i}>
              {fmtDate(r.at)} · <span className="font-medium text-foreground">{r.label}</span>
              {r.user ? ` (${r.user})` : ''}
              {r.until ? ` · hasta el ${r.until}` : ''}
              {r.reason ? ` · «${r.reason}»` : ''}
            </li>
          ))}
        </ul>
      )}

      {canEdit && live && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Responder al hallazgo">
            {OPTIONS.map((o) => (
              <Button key={o.key} size="sm" variant={open === o.key ? 'default' : 'outline'} disabled={pending || (o.key === 'posponer' && f.postponesLeft === 0)} title={o.key === 'posponer' && f.postponesLeft === 0 ? 'Ya se pospuso dos veces: decide o descártalo con un motivo.' : o.hint} onClick={() => choose(o.key)}>
                {o.label}
              </Button>
            ))}
          </div>
          {option && (
            <form
              className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/40 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send(option.key);
              }}
            >
              <p className="w-full text-xs text-muted-foreground">{option.hint}</p>
              {option.needs === 'reason' && (
                <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs">
                  Motivo *
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required placeholder="Una frase" />
                </label>
              )}
              {(option.needs === 'until' || option.needs === 'untilOptional') && (
                <label className="flex flex-col gap-1 text-xs">
                  {option.needs === 'until' ? 'Hasta el *' : 'Entrega (opcional; si no, 7 días)'}
                  <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} required={option.needs === 'until'} />
                </label>
              )}
              {option.needs === 'days' && (
                <label className="flex flex-col gap-1 text-xs">
                  Días *
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={days} onChange={(e) => setDays(e.target.value)}>
                    <option value="1">1 día</option>
                    <option value="7">7 días</option>
                    <option value="28">28 días</option>
                  </select>
                  <span className="text-muted-foreground">Quedan {f.postponesLeft} de 2</span>
                </label>
              )}
              <Button type="submit" size="sm" disabled={pending}>
                Guardar «{option.label}»
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className={msg.ok ? 'mt-2 flex items-start gap-1.5 text-sm text-success' : 'mt-2 flex items-start gap-1.5 text-sm text-destructive'}>
          {msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>
            {msg.text}
            {msg.url && (
              <>
                {' '}
                <a className="underline" href={msg.url} target="_blank" rel="noreferrer">
                  Abrir el encargo
                </a>
              </>
            )}
          </span>
        </p>
      )}
    </article>
  );
}
