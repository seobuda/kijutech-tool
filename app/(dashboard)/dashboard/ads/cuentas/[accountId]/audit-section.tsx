'use client';

// Google Ads · Cuenta · paso 4 del guion de revisión: «¿Dónde se va el dinero sin resultado?» (auditoría de higiene, paso 3;
// diseño §13.7). Los 3 primeros controles en «mal» con su evidencia, qué hacer (a mano en Google Ads), la predicción si
// es R2/R3 y las respuestas del gestor; la auditoría completa por tandas (también lo que está bien y lo no comprobado);
// los datos de la ficha que usa, con su fecha de confirmación (NEG-07). Quien solo puede ver, ve sin botones.
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, ClipboardCopy, Eye, RefreshCw, ScanSearch, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState } from '@/components/ui/page';
import { confirmAdsFichaFactAction, markAdsAuditReadAction, respondAdsAuditItemAction, runAdsAuditNowAction } from '@/lib/ads/actions';
import { AUDIT_RESPONSES, AUDIT_RESPONSE_LABEL, AUDIT_RESPONSE_NEEDS_REASON, TANDA_LABEL, type AuditResponse } from '@/lib/ads/audit-labels';
import type { AuditItemView, AuditView } from '@/lib/ads/audit-views';

type Msg = { ok: boolean; text: string } | null;
const fmtDay = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const money = (v: number, cur: string | null) => {
  try {
    return v.toLocaleString('es-ES', { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: v >= 100 ? 0 : 2 });
  } catch {
    return v.toFixed(2);
  }
};

function Flash({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={msg.ok ? 'flex items-start gap-1.5 text-sm text-success' : 'flex items-start gap-1.5 text-sm text-destructive'}>
      {msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{msg.text}</span>
    </p>
  );
}

function StatusBadge({ i }: { i: AuditItemView }) {
  if (i.status === 'mal' && i.regressedAt) return <Badge tone="danger">reapareció</Badge>;
  if (i.status === 'mal' && i.needsConfirmation) return <Badge tone="warning">mal · confirmar ficha</Badge>;
  if (i.status === 'mal') return <Badge tone="danger">mal</Badge>;
  if (i.status === 'bien') return <Badge tone="success">{i.fixedAt ? 'corregido' : 'bien'}</Badge>;
  if (i.control === 'propiedad_accesos' && i.response === 'hecho') return <Badge tone="success">comprobado a mano</Badge>;
  return <Badge tone="neutral">no comprobado</Badge>;
}

function Responses({ i }: { i: AuditItemView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<AuditResponse | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const send = (r: AuditResponse) =>
    start(async () => {
      const res = await respondAdsAuditItemAction(i.id, r, AUDIT_RESPONSE_NEEDS_REASON.includes(r) ? reason : null);
      if (res.ok) {
        setMsg({ ok: true, text: res.message });
        setChosen(null);
        setReason('');
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });
  const options = i.control === 'propiedad_accesos' ? (['hecho', 'mas_tarde'] as AuditResponse[]) : [...AUDIT_RESPONSES];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((r) => (
          <Button
            key={r}
            type="button"
            size="sm"
            variant={chosen === r ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => (AUDIT_RESPONSE_NEEDS_REASON.includes(r) ? setChosen(chosen === r ? null : r) : send(r))}
          >
            {i.control === 'propiedad_accesos' && r === 'hecho' ? 'Comprobado' : AUDIT_RESPONSE_LABEL[r].replace(' (corregido a mano en Google Ads)', '')}
          </Button>
        ))}
      </div>
      {chosen && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(chosen);
          }}
        >
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs">
            Motivo * (queda registrado como decisión de no actuar)
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required placeholder="En una línea" />
          </label>
          <Button type="submit" size="sm" disabled={pending || reason.trim().length < 3}>
            Guardar
          </Button>
        </form>
      )}
      <Flash msg={msg} />
    </div>
  );
}

function ItemCard({ i, canEdit, compact = false }: { i: AuditItemView; canEdit: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <article className="rounded-xl border bg-card p-4 text-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge i={i} />
            <span className="text-xs text-muted-foreground">
              {i.label} · {i.capability} · {i.risk}
            </span>
          </div>
          <h4 className="mt-1 font-medium">{i.title}</h4>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {i.exposure !== null && i.status === 'mal' && <div className="font-medium text-foreground">{money(i.exposure, i.currency)} expuestos</div>}
          {compact && (
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Ocultar' : 'Ver detalle'}
            </button>
          )}
        </div>
      </header>
      {open && (
        <div className="mt-2 space-y-2">
          {i.reason && <p className="text-xs text-muted-foreground">{i.reason}</p>}
          {i.uncheckedReason && i.status !== 'no_comprobado' && <p className="text-xs text-muted-foreground">Última pasada sin comprobar: {i.uncheckedReason}</p>}
          {i.lines.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {i.lines.map((l, k) => (
                <li key={k}>{l}</li>
              ))}
            </ul>
          )}
          {i.regressedAt && i.status === 'mal' && (
            <p className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive">
              Estaba bien y volvió el {fmtDay(i.regressedAt)}
              {i.regressionCount > 1 ? ` (${i.regressionCount} veces)` : ''}. {i.regressionCause}
            </p>
          )}
          {i.fixedAt && i.status === 'bien' && <p className="text-xs text-success">Corregido el {fmtDay(i.fixedAt)} (lo vio la vigilancia diaria).</p>}
          {i.status === 'mal' && i.todo.length > 0 && (
            <div>
              <p className="text-xs font-medium">Qué hacer (a mano en Google Ads; la herramienta no cambia nada):</p>
              <ul className="list-decimal space-y-0.5 pl-5 text-xs">
                {i.todo.map((t, k) => (
                  <li key={k}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {i.control === 'propiedad_accesos' && i.response !== 'hecho' && (
            <ul className="list-decimal space-y-0.5 pl-5 text-xs">
              {i.todo.map((t, k) => (
                <li key={k}>{t}</li>
              ))}
            </ul>
          )}
          {i.prediction && i.status === 'mal' && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <p className="font-medium">Predicción previa (se aprueba al responder «Hecho»)</p>
              <p>{i.prediction.hipotesis}</p>
              <p>
                <strong>Métrica:</strong> {i.prediction.metrica} · <strong>Esperado:</strong> {i.prediction.esperado} · <strong>Ventana:</strong> {i.prediction.ventanaDias} días
              </p>
              <p>
                <strong>Vuelta atrás:</strong> {i.prediction.vueltaAtras}
              </p>
            </div>
          )}
          {i.response && (
            <p className="text-xs text-muted-foreground">
              Respuesta: <strong>{i.responseLabel}</strong>
              {i.responseReason ? ` — ${i.responseReason}` : ''}
              {i.respondedBy ? ` · ${i.respondedBy}` : ''} · {fmtDay(i.respondedAt)}
              {i.response === 'hecho' && i.status === 'mal' ? ' · la vigilancia aún lo ve mal' : ''}
            </p>
          )}
          {canEdit && (i.status === 'mal' || i.control === 'propiedad_accesos') && <Responses i={i} />}
        </div>
      )}
    </article>
  );
}

function RunButton({ accountId, fresh, label }: { accountId: string; fresh: boolean; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant={fresh ? 'outline' : 'default'}
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (fresh && !confirm('Se hará una auditoría nueva con los datos de hoy; la anterior se guarda como sustituida (con sus respuestas). ¿Seguir?')) return;
            const r = await runAdsAuditNowAction(accountId, fresh);
            setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })
        }
      >
        {fresh ? <RefreshCw aria-hidden /> : <ScanSearch aria-hidden />} {pending ? 'Auditando…' : label}
      </Button>
      <Flash msg={msg} />
    </div>
  );
}

function ReadButton({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await markAdsAuditReadAction(auditId);
            setMsg(r.ok ? { ok: true, text: 'Marcada como leída: en Cartera sale «hecha».' } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })
        }
      >
        <Eye aria-hidden /> Marcar auditoría leída
      </Button>
      <Flash msg={msg} />
    </span>
  );
}

function CopyReport({ text }: { text: string }) {
  const [done, setDone] = useState<Msg>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone({ ok: true, text: 'Informe copiado (por tandas, con el gasto expuesto). No se envía a nadie.' });
          } catch {
            setDone({ ok: false, text: 'El navegador no deja copiar: abre «Ver la auditoría completa».' });
          }
        }}
      >
        <ClipboardCopy aria-hidden /> Copiar informe
      </Button>
      <Flash msg={done} />
    </span>
  );
}

function FichaFacts({ accountId, ficha, canEdit }: { accountId: string; ficha: NonNullable<AuditView['ficha']>; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {ficha.source === 'simulada' ? 'Ficha simulada (cuenta inventada): sus fechas de confirmación también lo son.' : `Un dato sin confirmar o confirmado hace más de ${ficha.months} meses no sirve para afirmar «mal»: el control queda «confirmar con el responsable».`}{' '}
        {ficha.clientId && (
          <Link href={`/dashboard/clientes/${ficha.clientId}`} className="underline underline-offset-2">
            Editar la ficha del cliente
          </Link>
        )}
      </p>
      <ul className="divide-y rounded-xl border text-sm">
        {ficha.facts.map((f) => (
          <li key={f.fact} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0">
              <span className="font-medium">{f.label}</span>
              <span className="block truncate text-xs text-muted-foreground" title={f.value}>
                {f.value || 'vacío en la ficha'}
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs">
              <Badge tone={f.fresh ? 'success' : 'warning'}>{f.confirmedAt ? `confirmado ${fmtDay(f.confirmedAt)}` : 'sin confirmar'}</Badge>
              {canEdit && ficha.source === 'ficha' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await confirmAdsFichaFactAction(accountId, f.fact);
                      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
                      if (r.ok) router.refresh();
                    })
                  }
                >
                  Confirmar
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Flash msg={msg} />
    </div>
  );
}

export function AuditSection({ accountId, view, canEdit }: { accountId: string; view: AuditView; canEdit: boolean }) {
  const a = view.audit;
  if (!a) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={ScanSearch}
          title="Aún sin auditar"
          description="La auditoría de higiene se hace sola cuando la cuenta tiene descargadas su estructura y sus métricas (y otra vez al terminar el histórico, con la línea base de 90 días). Solo lee Google Ads."
          className="py-8"
        />
        {canEdit ? <RunButton accountId={accountId} fresh={false} label="Pasar la auditoría ahora" /> : <p className="text-xs text-muted-foreground">Hace falta permiso de edición para pasarla.</p>}
      </div>
    );
  }
  const byTanda = [0, 1, 2, 3].map((t) => ({ t, list: view.items.filter((i) => i.tanda === t) })).filter((x) => x.list.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <div className="space-y-1">
          <p>
            Auditoría de entrada del <strong>{fmtDay(a.createdAt)}</strong> {a.createdBy ? `(pedida por ${a.createdBy})` : '(automática)'}, datos hasta el {fmtDay(a.dataThrough)}
            {a.previous > 0 ? ` · ${a.previous} anterior${a.previous > 1 ? 'es' : ''} sustituida${a.previous > 1 ? 's' : ''}` : ''}. La vigilancia la repasa cada día.
          </p>
          <p className="flex flex-wrap gap-1.5">
            <Badge tone="danger">{view.counts.mal} mal</Badge>
            {view.counts.regressed > 0 && <Badge tone="danger">{view.counts.regressed} reapareció</Badge>}
            {view.counts.confirmar > 0 && <Badge tone="warning">{view.counts.confirmar} por confirmar en la ficha</Badge>}
            <Badge tone="success">{view.counts.bien} bien</Badge>
            <Badge tone="neutral">{view.counts.noComprobado} sin comprobar</Badge>
          </p>
          <p className="text-xs text-muted-foreground">{a.readAt ? `Leída el ${fmtDay(a.readAt)}${a.readBy ? ` por ${a.readBy}` : ''}.` : 'Sin leer todavía: en Cartera sale «pendiente».'}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {canEdit && !a.readAt && <ReadButton auditId={a.id} />}
          <CopyReport text={view.report} />
          {canEdit && <RunButton accountId={accountId} fresh label="Repetir la auditoría" />}
        </div>
      </div>

      {view.ownershipPending && (
        <p className="rounded-lg border bg-warning-soft px-3 py-2 text-xs text-warning-strong">
          Tanda 0: la propiedad y los accesos de la cuenta se comprueban a mano (la API no los da). Está en «Ver la auditoría completa».
        </p>
      )}

      {view.top.length ? (
        <div className="space-y-3">
          {view.top.map((i) => (
            <ItemCard key={i.id} i={i} canEdit={canEdit} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border px-3 py-3 text-sm text-muted-foreground">Nada que recortar ahora: ningún control está «mal» con datos confirmados. Mira abajo lo que no se pudo comprobar: eso no es «todo bien».</p>
      )}
      {view.counts.mal > view.top.length && <p className="text-xs text-muted-foreground">Hay {view.counts.mal - view.top.length} más en «mal»: están en la auditoría completa (aquí solo 3).</p>}

      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">Ver la auditoría completa ({view.items.length} controles, por tandas)</summary>
        <div className="mt-3 space-y-5">
          {byTanda.map(({ t, list }) => (
            <section key={t} className="space-y-2">
              <h4 className="text-sm font-semibold">{TANDA_LABEL[t]}</h4>
              {list.map((i) => (
                <ItemCard key={i.id} i={i} canEdit={canEdit} compact />
              ))}
            </section>
          ))}
          <p className="text-xs text-muted-foreground">{TANDA_LABEL[4]}: sin controles en este paso.</p>
          {view.data.some((d) => !d.ok) && (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">Datos que Google no devolvió (sus controles dicen «no comprobado»):</p>
              <ul className="list-disc pl-5">
                {view.data
                  .filter((d) => !d.ok)
                  .map((d) => (
                    <li key={d.kind}>
                      {d.kind}: {d.error ?? 'sin detalle'}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {view.ficha ? (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">Datos de la ficha que usa la auditoría</summary>
          <div className="mt-3">
            <FichaFacts accountId={accountId} ficha={view.ficha} canEdit={canEdit} />
          </div>
        </details>
      ) : (
        <p className="text-xs text-muted-foreground">Sin ficha de cliente (cuenta sin vincular): la zona, la marca, el teléfono y el sector no se pueden comprobar. Vincúlala en Ajustes de Google Ads.</p>
      )}
    </div>
  );
}
