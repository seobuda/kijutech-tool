'use client';

// Proyecto → Expediente: parte interactiva (recoger datos, confirmar o descartar cada uno, escribir el correcto y pasar
// el tipo de negocio o el logo a la ficha del cliente). Mientras se recogen los datos, se refresca sola.
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Mail, Pencil, RefreshCw, RotateCcw, ShieldCheck, ShieldQuestion, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { DossierFactView, DossierView } from '@/lib/seo/expediente/view';
import { display } from '@/lib/seo/expediente/rules';
import { applyFactToFichaAction, collectDossierAction, decideDossierFactAction, prepareQuestionsAction, savePersonaFactAction } from '@/lib/seo/expediente-actions';
import type { QuestionsState } from '@/lib/seo/preguntas/preguntas';

const SOURCE: Record<string, string> = { ficha: 'Ficha', web: 'Web', places: 'Google Maps', wayback: 'Archivo de Internet', gsc: 'Search Console', busqueda: 'Búsqueda', persona: 'Persona', ia: 'IA', cliente: 'Respuesta del cliente' };
const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  confirmado: { label: 'Confirmado', tone: 'success' },
  provisional: { label: 'Provisional', tone: 'warning' },
  descartado: { label: 'Descartado', tone: 'neutral' }
};
const EDITABLE = new Set(['nombre', 'web', 'telefono', 'tipo_negocio', 'perfiles', 'logo', 'servicios', 'zona']);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function valueText(field: string, v: unknown, types: { value: string; label: string }[]): string {
  if (field === 'tipo_negocio' && typeof v === 'string') return types.find((t) => t.value === v)?.label ?? v;
  if (field === 'marca_en_google' && v && typeof v === 'object') {
    const m = v as { busquedas?: number; clics?: number; impresiones?: number; ejemplos?: string[] };
    return `${m.clics ?? 0} clics y ${m.impresiones ?? 0} impresiones en ${m.busquedas ?? 0} búsquedas${m.ejemplos?.length ? ` (p. ej. «${m.ejemplos.slice(0, 3).join('», «')}»)` : ''}`;
  }
  if ((field === 'primera_fecha_web' || field === 'datos_search_console') && typeof v === 'string') return new Date(v).toLocaleDateString('es-ES', { dateStyle: 'long' });
  return display(field, v);
}

export function DossierPanel({ view, canEdit, businessTypes, questions }: { view: DossierView; canEdit: boolean; businessTypes: { value: string; label: string }[]; questions: QuestionsState | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!view.collecting) return;
    const t = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(t);
  }, [view.collecting, router]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ type: 'error', text: r.error });
      else if (okText) setMsg({ type: 'ok', text: okText });
      router.refresh();
    });

  if (!view.project.clientId) {
    return (
      <EmptyState
        title="El proyecto no tiene cliente"
        description="El expediente se hace con la ficha del cliente: edita el proyecto y elige el cliente."
        action={
          <Button asChild className="bg-brand text-white hover:bg-brand/90">
            <Link href={`/dashboard/projects/${view.project.id}/edit`}>Editar el proyecto</Link>
          </Button>
        }
      />
    );
  }

  const any = view.fields.some((f) => f.facts.length);
  const collectBtn = canEdit && (
    <Button size="sm" variant="outline" disabled={pending || view.collecting} onClick={() => run(() => collectDossierAction(view.project.id), 'Recogiendo datos: tarda menos de un minuto.')}>
      {view.collecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {view.collecting ? 'Recogiendo…' : 'Volver a recoger'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {msg && <p className={msg.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>{msg.text}</p>}

      {!any ? (
        <EmptyState
          title="Aún no hay datos"
          description="Pulsa «Recoger datos»: miramos la ficha, la web, el archivo de Internet y Search Console. También se hace solo al terminar cada auditoría de Salud técnica."
          action={
            canEdit ? (
              <Button className="bg-brand text-white hover:bg-brand/90" disabled={pending || view.collecting} onClick={() => run(() => collectDossierAction(view.project.id), 'Recogiendo datos: tarda menos de un minuto.')}>
                {view.collecting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {view.collecting ? 'Recogiendo…' : 'Recoger datos'}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Section
            title={
              <span className="inline-flex items-center gap-2">
                {view.identity.status === 'identificado' ? <ShieldCheck className="size-4 text-success" /> : <ShieldQuestion className="size-4 text-warning-strong" />}
                {view.identity.status === 'identificado' ? 'Identidad confirmada' : 'Identidad provisional'}
              </span>
            }
            description={`Última actualización: ${fmt(view.lastUpdate)}`}
            actions={collectBtn}
          >
            <p className="text-sm">
              {view.identity.status === 'identificado'
                ? 'Al menos dos señales independientes coinciden con la ficha: sabemos que hablamos del mismo negocio.'
                : 'Hace falta que al menos dos señales (dominio, teléfono, nombre o dirección) coincidan entre la ficha y otra fuente. Completa la ficha o confirma los datos.'}
            </p>
            {view.identity.matches.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Coinciden: {view.identity.matches.join(' · ')}</p>}
            {view.identity.conflicts.length > 0 && (
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
                <p className="font-medium">No cuadra:</p>
                <ul className="mt-1 list-disc pl-5">
                  {view.identity.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <Link href={`/dashboard/clientes/${view.project.clientId}`} className="mt-2 inline-block underline underline-offset-2">
                  Abrir la ficha del cliente
                </Link>
              </div>
            )}
          </Section>

          <Section title="Datos del negocio" description="Ordenados por confianza. «Confirmar» fija el dato; si cambia en su origen, vuelve a revisión.">
            <div className="divide-y">
              {view.fields
                .filter((f) => f.facts.length || (canEdit && EDITABLE.has(f.field)))
                .map((f) => (
                  <FieldRow key={f.field} projectId={view.project.id} field={f} canEdit={canEdit} pending={pending} run={run} businessTypes={businessTypes} />
                ))}
            </div>
          </Section>

          {questions && <QuestionsSection projectId={view.project.id} state={questions} canEdit={canEdit} pending={pending} run={run} />}
        </>
      )}
    </div>
  );
}

const MSG_STATUS: Record<string, string> = {
  pendiente_aprobacion: 'esperando tu aprobación (Telegram o Para ti)',
  aprobado: 'aprobado, saliendo',
  enviado: 'enviado',
  rechazado: 'descartado',
  fallido: 'no se pudo enviar'
};

function QuestionsSection({
  projectId,
  state,
  canEdit,
  pending,
  run
}: {
  projectId: string;
  state: QuestionsState;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
}) {
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <Mail className="size-4" />
          Preguntas al cliente
        </span>
      }
      description="Como mucho 3, solo lo que no hemos podido averiguar solos. El correo sale del buzón del agente cuando tú lo apruebas; cuando el cliente contesta, sus respuestas aparecen aquí arriba como «Respuesta del cliente» para que las confirmes, y el agente te propone la respuesta de agradecimiento."
      actions={
        canEdit && state.canSend ? (
          <Button size="sm" className="bg-brand text-white hover:bg-brand/90" disabled={pending} onClick={() => run(() => prepareQuestionsAction(projectId), 'Correo preparado: te llega para aprobarlo.')}>
            <Mail className="size-3.5" />
            Preparar el correo
          </Button>
        ) : undefined
      }
    >
      {state.last && (
        <p className="mb-3 text-sm">
          Último correo: «{state.last.subject}», {MSG_STATUS[state.last.status] ?? state.last.status}
          {state.last.sentAt ? ` el ${fmt(state.last.sentAt)}` : ` (preparado el ${fmt(state.last.createdAt)})`}.
          {state.last.sentAt ? (state.answers ? ` Respuestas guardadas: ${state.answers}.` : ' Aún sin respuesta.') : ''}
        </p>
      )}
      {state.questions.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">{state.canSend ? 'Si lo preparas ahora, preguntaría:' : 'Ahora se preguntaría:'}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {state.questions.map((q) => (
              <li key={q.field}>{q.text}</li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nada que preguntar: el expediente no tiene huecos ni datos dudosos.</p>
      )}
      {state.blocked && state.questions.length > 0 && <p className="mt-2 text-sm text-warning-strong">{state.blocked}</p>}
    </Section>
  );
}

function FieldRow({
  projectId,
  field,
  canEdit,
  pending,
  run,
  businessTypes
}: {
  projectId: string;
  field: DossierView['fields'][number];
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
  businessTypes: { value: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{field.label}</p>
        {canEdit && EDITABLE.has(field.field) && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Escribir el correcto
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {field.field === 'tipo_negocio' ? (
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={text} onChange={(e) => setText(e.target.value)}>
              <option value="">Elige…</option>
              {businessTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : (
            <Input className="h-9 max-w-md" value={text} onChange={(e) => setText(e.target.value)} placeholder={field.field === 'perfiles' ? 'URLs separadas por comas' : ''} />
          )}
          <Button
            size="sm"
            className="bg-brand text-white hover:bg-brand/90"
            disabled={pending || !text.trim()}
            onClick={() => {
              run(() => savePersonaFactAction(projectId, field.field, text), 'Guardado.');
              setEditing(false);
              setText('');
            }}
          >
            Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {field.facts.length === 0 && !editing && <p className="mt-1 text-sm text-muted-foreground">Sin datos.</p>}
      <ul className="mt-1 flex flex-col gap-1.5">
        {field.facts.map((x) => (
          <FactLine key={x.id} projectId={projectId} fact={x} canEdit={canEdit} pending={pending} run={run} businessTypes={businessTypes} />
        ))}
      </ul>
    </div>
  );
}

function FactLine({
  projectId,
  fact,
  canEdit,
  pending,
  run,
  businessTypes
}: {
  projectId: string;
  fact: DossierFactView;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
  businessTypes: { value: string; label: string }[];
}) {
  const st = STATUS[fact.status];
  const toFicha = canEdit && fact.source !== 'ficha' && fact.status !== 'descartado' && (fact.field === 'tipo_negocio' || fact.field === 'logo' || fact.field === 'servicios');
  return (
    <li className={fact.status === 'descartado' ? 'flex flex-wrap items-center gap-2 text-sm text-muted-foreground line-through' : 'flex flex-wrap items-center gap-2 text-sm'}>
      <span className="break-all">{valueText(fact.field, fact.value, businessTypes)}</span>
      <Badge tone="outline">{SOURCE[fact.source] ?? fact.source}</Badge>
      <Badge tone={fact.confidence >= 80 ? 'success' : fact.confidence >= 55 ? 'info' : 'neutral'}>{fact.confidence} %</Badge>
      <Badge tone={st.tone}>{st.label}</Badge>
      {fact.agrees.length > 0 && <span className="text-xs text-success">coincide con {fact.agrees.map((s) => SOURCE[s] ?? s).join(', ')}</span>}
      {fact.conflicts.length > 0 && <span className="text-xs text-warning-strong">distinto en {fact.conflicts.map((s) => SOURCE[s] ?? s).join(', ')}</span>}
      {fact.sourceRef && /^https?:\/\//.test(fact.sourceRef) && (
        <a href={fact.sourceRef.split(' ')[0]} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2">
          ver origen
        </a>
      )}
      {fact.source === 'cliente' && fact.sourceRef && <span className="basis-full text-xs text-muted-foreground">{fact.sourceRef}</span>}
      {canEdit && (
        <span className="ml-auto flex items-center gap-1">
          {fact.status !== 'confirmado' && fact.status !== 'descartado' && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideDossierFactAction(projectId, fact.id, 'confirmado'))}>
              <Check className="size-3.5" />
              Confirmar
            </Button>
          )}
          {fact.status !== 'descartado' && fact.source !== 'ficha' && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideDossierFactAction(projectId, fact.id, 'descartado'))}>
              <X className="size-3.5" />
              Descartar
            </Button>
          )}
          {fact.status !== 'provisional' && fact.source !== 'persona' && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideDossierFactAction(projectId, fact.id, 'provisional'))}>
              <RotateCcw className="size-3.5" />
              Reabrir
            </Button>
          )}
          {toFicha && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => applyFactToFichaAction(projectId, fact.id), 'Pasado a la ficha del cliente.')}>
              Pasar a la ficha
            </Button>
          )}
        </span>
      )}
    </li>
  );
}
