'use client';

// Pestaña «Webs y cuentas»: webs, dominios y cuentas del cliente (Search Console, Analytics, ficha de Google, Ads,
// redes, tienda, CRM), si tenemos acceso y DÓNDE están los accesos (nunca la contraseña). Arriba, qué pueden hacer los
// agentes con lo que hay (las integraciones se conectan una vez en Agentes → Integraciones).
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CircleCheck, CircleDashed, ExternalLink, Globe, Mail, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { ACCESS_LABEL, ACCESS_LEVELS, ASSET_INTEGRATION, ASSET_KIND_LABEL, ASSET_KINDS, type AssetKind } from '@/lib/core/client-rules';
import { deleteAssetAction, saveAssetAction } from '@/lib/core/client-actions';
import { areaClass, brandBtn, checkClass, ConfirmDelete, MsgLine, selectClass, useRun } from '../ui';
import { Field } from './tab-contactos';
import type { AssetView } from './ficha-view';

const empty: AssetView = { id: '', kind: 'web', label: '', value: '', access: 'sin_revisar', accessNotes: '', isPrimary: false, recognizeEmails: true, emailDomain: '', notes: '' };
const ACCESS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { si: 'success', pendiente: 'warning', no: 'danger', sin_revisar: 'neutral', no_aplica: 'neutral' };
const PLACEHOLDER: Partial<Record<AssetKind, string>> = {
  web: 'https://cliente.com',
  dominio: 'cliente.com',
  search_console: 'sc-domain:cliente.com o https://cliente.com/',
  analytics: 'properties/123456789',
  business_profile: 'Enlace o nombre de la ficha',
  google_ads: 'ID de cuenta (123-456-7890)',
  instagram: 'https://instagram.com/cliente'
};

export function WebsTab({ clientId, assets, integrations }: { clientId: string; assets: AssetView[]; integrations: { google: boolean; dataforseo: boolean } }) {
  const [edit, setEdit] = useState<string | null>(null);
  const { run, pending, msg } = useRun();
  const has = (k: AssetKind) => assets.some((a) => a.kind === k);

  // Qué pueden hacer los agentes con este cliente.
  const caps = (Object.entries(ASSET_INTEGRATION) as [AssetKind, { provider: string | null; label: string }][]).map(([k, v]) => {
    const asset = has(k);
    const connected = v.provider === null || (v.provider === 'google' && integrations.google);
    return { k, label: v.label, ok: asset && connected, why: !asset ? `Falta añadir ${ASSET_KIND_LABEL[k]}` : !connected ? 'Falta conectar Google en Agentes → Integraciones' : '' };
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-4 shadow-xs" aria-labelledby="h-integr">
        <h2 id="h-integr" className="text-sm font-semibold">
          Qué pueden hacer los agentes con este cliente
        </h2>
        <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
          {caps.map((c) => (
            <li key={c.k} className="flex items-start gap-2">
              {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Disponible" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="No disponible" />}
              <span>
                {c.label}
                {!c.ok && <span className="block text-xs text-muted-foreground">{c.why}</span>}
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2">
            {integrations.dataforseo ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Disponible" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="No disponible" />}
            <span>
              Posiciones y volumen de búsquedas (DataForSEO)
              {!integrations.dataforseo && <span className="block text-xs text-muted-foreground">Falta conectar DataForSEO en Agentes → Integraciones</span>}
            </span>
          </li>
        </ul>
        {(!integrations.google || !integrations.dataforseo) && (
          <Link href="/dashboard/agentes/integraciones" className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:underline">
            Ir a Integraciones
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-warning-strong">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Aquí no se guardan contraseñas: solo si tenemos acceso y dónde están los accesos.
        </p>
        <Button size="sm" variant="outline" disabled={edit !== null} onClick={() => setEdit('new')}>
          <Plus aria-hidden />
          Añadir web o cuenta
        </Button>
      </div>
      <MsgLine msg={msg} />

      {edit === 'new' && <AssetForm initial={empty} pending={pending} onCancel={() => setEdit(null)} onSave={(v) => run(() => saveAssetAction(clientId, toInput(v, null)), 'Añadido.', () => setEdit(null))} />}

      {assets.length === 0 && edit !== 'new' ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Todavía no hay webs ni cuentas. Empieza por su web: con ella los agentes pueden auditarla y reconocer sus correos.</p>
      ) : (
        <ul className="space-y-2">
          {assets.map((a) =>
            edit === a.id ? (
              <li key={a.id}>
                <AssetForm initial={a} pending={pending} onCancel={() => setEdit(null)} onSave={(v) => run(() => saveAssetAction(clientId, toInput(v, a.id)), 'Guardado.', () => setEdit(null))} />
              </li>
            ) : (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      {ASSET_KIND_LABEL[a.kind as AssetKind] ?? a.kind}
                      {a.label && <span className="font-normal text-muted-foreground">«{a.label}»</span>}
                      <Badge tone={ACCESS_TONE[a.access] ?? 'neutral'}>{ACCESS_LABEL[a.access as keyof typeof ACCESS_LABEL] ?? a.access}</Badge>
                      {a.isPrimary && <Badge tone="brand">Principal</Badge>}
                    </p>
                    {a.value &&
                      (/^https?:\/\//.test(a.value) ? (
                        <a href={a.value} target="_blank" rel="noopener noreferrer" className="block truncate text-brand hover:underline">
                          {a.value}
                        </a>
                      ) : (
                        <p className="truncate text-muted-foreground">{a.value}</p>
                      ))}
                    {a.accessNotes && <p className="text-xs text-muted-foreground">Accesos: {a.accessNotes}</p>}
                    {a.emailDomain && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="size-3" aria-hidden />
                        Reconoce los correos de @{a.emailDomain}
                      </p>
                    )}
                    {a.notes && <p className="text-xs text-muted-foreground whitespace-pre-line">{a.notes}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button size="sm" variant="ghost" disabled={pending || edit !== null} onClick={() => setEdit(a.id)}>
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  <ConfirmDelete what="esta web o cuenta" disabled={pending} onConfirm={() => run(() => deleteAssetAction(clientId, a.id), 'Eliminado.')} />
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

const toInput = (v: AssetView, id: string | null) => ({
  id,
  kind: v.kind,
  label: v.label,
  value: v.value,
  access: v.access,
  accessNotes: v.accessNotes,
  isPrimary: v.isPrimary,
  recognizeEmails: (v.kind === 'web' || v.kind === 'dominio') && v.recognizeEmails,
  notes: v.notes
});

function AssetForm({ initial, pending, onSave, onCancel }: { initial: AssetView; pending: boolean; onSave: (v: AssetView) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const set = (p: Partial<AssetView>) => setF((c) => ({ ...c, ...p }));
  const canRecognize = f.kind === 'web' || f.kind === 'dominio';
  return (
    <div className="space-y-3 rounded-lg border border-brand/40 bg-card p-3 shadow-sm" data-testid="activo-form">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Tipo" required>
          <select className={cn(selectClass, 'w-full')} value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {ASSET_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dirección o identificador" wide>
          <Input value={f.value} onChange={(e) => set({ value: e.target.value })} placeholder={PLACEHOLDER[f.kind as AssetKind] ?? 'https://…'} />
        </Field>
        <Field label="Nombre (opcional)">
          <Input value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="Ej.: tienda online" />
        </Field>
        <Field label="¿Tenemos acceso?">
          <select className={cn(selectClass, 'w-full')} value={f.access} onChange={(e) => set({ access: e.target.value })}>
            {ACCESS_LEVELS.map((a) => (
              <option key={a} value={a}>
                {ACCESS_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dónde están los accesos (sin contraseñas)">
          <Input value={f.accessNotes} onChange={(e) => set({ accessNotes: e.target.value })} placeholder="Ej.: gestor de la agencia, nos dio acceso a hola@…" />
        </Field>
        <Field label="Notas" wide>
          <textarea rows={2} className={areaClass} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className={checkClass} checked={f.isPrimary} onChange={(e) => set({ isPrimary: e.target.checked })} />
          Principal de su tipo
        </label>
        {canRecognize && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className={checkClass} checked={f.recognizeEmails} onChange={(e) => set({ recognizeEmails: e.target.checked })} />
            Los correos de este dominio son de este cliente
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" className={brandBtn} disabled={pending || (!f.value.trim() && !f.label.trim())} onClick={() => onSave(f)}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
