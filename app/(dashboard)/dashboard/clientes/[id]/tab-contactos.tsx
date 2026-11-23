'use client';

// Pestaña «Contactos»: personas del cliente (rol, correo, teléfono, WhatsApp, canal preferido, principal) y sus locales
// o sedes. Cada cambio se guarda al momento. Los correos de los contactos activos sirven para reconocer sus emails.
import { useState } from 'react';
import { AlertTriangle, Mail, MapPin, Pencil, Plus, Star, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { CHANNEL_LABEL, CHANNELS, CONTACT_ROLE_LABEL, CONTACT_ROLES } from '@/lib/core/client-rules';
import { deleteContactAction, deleteLocationAction, saveContactAction, saveLocationAction, setClientCommsApprovalAction, setContactSubscriptionsAction } from '@/lib/core/client-actions';
import { COMMS_KIND_LABELS, COMMS_KINDS, SUBSCRIPTION_KINDS, type SubscriptionKind } from '@/lib/core/comms-rules';
import { areaClass, brandBtn, checkClass, ConfirmDelete, MsgLine, selectClass, useRun } from '../ui';
import type { ContactView, LocationView } from './ficha-view';

const emptyContact: ContactView = { id: '', name: '', jobTitle: '', role: 'otro', email: '', phone: '', whatsapp: '', preferredChannel: '', isPrimary: false, notes: '', active: true };
const emptyLocation: LocationView = { id: '', name: '', address: '', city: '', postalCode: '', region: '', country: 'España', phone: '', hours: '', isPrimary: false, notes: '' };

export function ContactosTab({
  clientId,
  contacts,
  locations,
  isAdmin,
  comms
}: {
  clientId: string;
  contacts: ContactView[];
  locations: LocationView[];
  isAdmin: boolean;
  comms?: { approval: string; tenantDefault: string };
}) {
  const [editC, setEditC] = useState<string | null>(null); // id, 'new' o null
  const [editR, setEditR] = useState<string | null>(null); // contacto cuyo «qué recibe» se edita
  // Tipos de mensaje sin nadie que los reciba: el sistema no podrá escribir al cliente de eso.
  const reachable = (k: string) => contacts.some((p) => p.active && p.email && (p.receives ?? []).some((r) => r === k || r === 'todo'));
  const unreachable = COMMS_KINDS.filter((k) => !reachable(k));
  const [editL, setEditL] = useState<string | null>(null);
  const { run, pending, msg } = useRun();

  return (
    <div className="space-y-6">
      <MsgLine msg={msg} />
      {comms && (
        <section className="space-y-2 rounded-lg border bg-card p-3 text-sm shadow-xs" aria-labelledby="h-comms">
          <h2 id="h-comms" className="flex items-center gap-1.5 text-sm font-semibold">
            <Mail className="size-4 text-muted-foreground" aria-hidden />
            Correos a este cliente
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="comms-approval" className="text-xs text-muted-foreground">
              Antes de salir:
            </label>
            <select
              id="comms-approval"
              className={cn(selectClass, 'h-8 text-xs')}
              defaultValue={comms.approval}
              disabled={!isAdmin || pending}
              onChange={(e) => run(() => setClientCommsApprovalAction(clientId, e.target.value), 'Guardado.')}
            >
              <option value="heredar">Lo de la cuenta ({comms.tenantDefault === 'nunca' ? 'salen solos' : 'pasan por tu aprobación'})</option>
              <option value="siempre">Siempre pasan por tu aprobación</option>
              <option value="nunca">Salen sin aprobación</option>
            </select>
            {!isAdmin && <span className="text-xs text-muted-foreground">Solo lo cambia administración.</span>}
          </div>
          {unreachable.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-warning-strong">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Nadie recibe {unreachable.map((k) => COMMS_KIND_LABELS[k].toLowerCase()).join(', ')}: el equipo y los agentes no podrán escribir a este cliente de eso. Márcalo en «Qué recibe» de un contacto con correo.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Cada tipo de correo tiene al menos un contacto que lo recibe.</p>
          )}
        </section>
      )}
      <section className="space-y-3" aria-labelledby="h-contactos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="h-contactos" className="text-sm font-semibold">
              Personas
            </h2>
            <p className="text-xs text-muted-foreground">Quién decide, quién paga, con quién se habla del día a día. Sus correos se reconocen solos al llegar.</p>
          </div>
          <Button size="sm" variant="outline" disabled={editC !== null} onClick={() => setEditC('new')}>
            <Plus aria-hidden />
            Añadir contacto
          </Button>
        </div>
        {editC === 'new' && <ContactForm initial={emptyContact} pending={pending} onCancel={() => setEditC(null)} onSave={(v) => run(() => saveContactAction(clientId, { ...v, id: null }), 'Contacto añadido.', () => setEditC(null))} />}
        {contacts.length === 0 && editC !== 'new' ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Aún no hay contactos. Añade al menos uno con correo o teléfono.</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((p) =>
              editC === p.id ? (
                <li key={p.id}>
                  <ContactForm initial={p} pending={pending} onCancel={() => setEditC(null)} onSave={(v) => run(() => saveContactAction(clientId, { ...v, id: p.id }), 'Contacto guardado.', () => setEditC(null))} />
                </li>
              ) : (
                <li key={p.id} className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs sm:flex-row sm:items-start sm:justify-between', !p.active && 'opacity-60')}>
                  <div className="flex min-w-0 gap-3">
                    <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        {p.name}
                        {p.jobTitle && <span className="font-normal text-muted-foreground">· {p.jobTitle}</span>}
                        <Badge tone="outline">{CONTACT_ROLE_LABEL[p.role as keyof typeof CONTACT_ROLE_LABEL] ?? p.role}</Badge>
                        {p.isPrimary && (
                          <Badge tone="brand">
                            <Star aria-hidden />
                            Principal
                          </Badge>
                        )}
                        {!p.active && <Badge tone="neutral">Inactivo</Badge>}
                      </p>
                      <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                        {p.email && <span>{p.email}</span>}
                        {p.phone && <span>Tel. {p.phone}</span>}
                        {p.whatsapp && <span>WhatsApp {p.whatsapp}</span>}
                        {p.preferredChannel && <span>Prefiere {CHANNEL_LABEL[p.preferredChannel as keyof typeof CHANNEL_LABEL] ?? p.preferredChannel}</span>}
                      </p>
                      {p.notes && <p className="text-xs text-muted-foreground whitespace-pre-line">{p.notes}</p>}
                      {comms && editR !== p.id && (
                        <p className="flex flex-wrap items-center gap-1 pt-1 text-xs">
                          <span className="text-muted-foreground">Recibe:</span>
                          {(p.receives ?? []).length ? (
                            (p.receives ?? []).map((k) => (
                              <Badge key={k} tone="info">
                                {COMMS_KIND_LABELS[k as SubscriptionKind] ?? k}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">nada</span>
                          )}
                          {!p.email && <span className="text-warning-strong">· sin correo, no puede recibir</span>}
                        </p>
                      )}
                      {comms && editR === p.id && (
                        <ReceivesEditor
                          initial={p.receives ?? []}
                          pending={pending}
                          onCancel={() => setEditR(null)}
                          onSave={(kinds) => run(() => setContactSubscriptionsAction(clientId, p.id, kinds), 'Guardado qué recibe.', () => setEditR(null))}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {!p.isPrimary && p.active && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => saveContactAction(clientId, { id: p.id, isPrimary: true }), 'Contacto principal cambiado.')}>
                        <Star aria-hidden />
                        Hacer principal
                      </Button>
                    )}
                    {comms && (
                      <Button size="sm" variant="ghost" disabled={pending || editR !== null} onClick={() => setEditR(p.id)}>
                        <Mail aria-hidden />
                        Qué recibe
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={pending || editC !== null} onClick={() => setEditC(p.id)}>
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                    {isAdmin && <ConfirmDelete what={`a ${p.name}`} disabled={pending} onConfirm={() => run(() => deleteContactAction(clientId, p.id), 'Contacto eliminado.')} />}
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="h-locales">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="h-locales" className="text-sm font-semibold">
              Locales y sedes
            </h2>
            <p className="text-xs text-muted-foreground">Dirección, teléfono y horario de cada tienda u oficina (útil para SEO local y su ficha de Google).</p>
          </div>
          <Button size="sm" variant="outline" disabled={editL !== null} onClick={() => setEditL('new')}>
            <Plus aria-hidden />
            Añadir local
          </Button>
        </div>
        {editL === 'new' && <LocationForm initial={emptyLocation} pending={pending} onCancel={() => setEditL(null)} onSave={(v) => run(() => saveLocationAction(clientId, { ...v, id: null }), 'Local añadido.', () => setEditL(null))} />}
        {locations.length === 0 && editL !== 'new' ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Sin locales. Si tiene tienda u oficina, añade su dirección.</p>
        ) : (
          <ul className="space-y-2">
            {locations.map((l) =>
              editL === l.id ? (
                <li key={l.id}>
                  <LocationForm initial={l} pending={pending} onCancel={() => setEditL(null)} onSave={(v) => run(() => saveLocationAction(clientId, { ...v, id: l.id }), 'Local guardado.', () => setEditL(null))} />
                </li>
              ) : (
                <li key={l.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        {l.name || 'Local'}
                        {l.isPrimary && <Badge tone="brand">Principal</Badge>}
                      </p>
                      <p className="text-muted-foreground">{[l.address, l.postalCode, l.city, l.region, l.country].filter(Boolean).join(', ')}</p>
                      <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                        {l.phone && <span>Tel. {l.phone}</span>}
                        {l.hours && <span>{l.hours}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button size="sm" variant="ghost" disabled={pending || editL !== null} onClick={() => setEditL(l.id)}>
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                    <ConfirmDelete what="este local" disabled={pending} onConfirm={() => run(() => deleteLocationAction(clientId, l.id), 'Local eliminado.')} />
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReceivesEditor({ initial, pending, onSave, onCancel }: { initial: string[]; pending: boolean; onSave: (kinds: string[]) => void; onCancel: () => void }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(initial));
  const all = sel.has('todo');
  const toggle = (k: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      if (k === 'todo' && n.has('todo')) return new Set(['todo']);
      return n;
    });
  return (
    <fieldset className="mt-2 space-y-2 rounded-md border p-2">
      <legend className="px-1 text-xs font-medium">Qué correos recibe</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {SUBSCRIPTION_KINDS.map((k) => (
          <label key={k} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" className={checkClass} checked={sel.has(k)} disabled={all && k !== 'todo'} onChange={() => toggle(k)} />
            {COMMS_KIND_LABELS[k]}
          </label>
        ))}
      </div>
      <div className="flex gap-1">
        <Button size="sm" className={brandBtn} disabled={pending} onClick={() => onSave([...sel])}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </fieldset>
  );
}

function ContactForm({ initial, pending, onSave, onCancel }: { initial: ContactView; pending: boolean; onSave: (v: ContactView) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const set = (p: Partial<ContactView>) => setF((c) => ({ ...c, ...p }));
  return (
    <div className="space-y-3 rounded-lg border border-brand/40 bg-card p-3 shadow-sm" data-testid="contacto-form">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nombre" required>
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Cargo">
          <Input value={f.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="Ej.: gerente" />
        </Field>
        <Field label="Rol">
          <select className={cn(selectClass, 'w-full')} value={f.role} onChange={(e) => set({ role: e.target.value })}>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {CONTACT_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Correo">
          <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="WhatsApp">
          <Input type="tel" value={f.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
        </Field>
        <Field label="Canal preferido">
          <select className={cn(selectClass, 'w-full')} value={f.preferredChannel} onChange={(e) => set({ preferredChannel: e.target.value })}>
            <option value="">—</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas" wide>
          <textarea rows={2} className={areaClass} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ej.: solo por las tardes" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className={checkClass} checked={f.isPrimary} onChange={(e) => set({ isPrimary: e.target.checked })} />
          Contacto principal
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className={checkClass} checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
          Activo (sus correos se reconocen)
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className={brandBtn} disabled={pending || (!f.name.trim() && !f.email.trim())} onClick={() => onSave(f)}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function LocationForm({ initial, pending, onSave, onCancel }: { initial: LocationView; pending: boolean; onSave: (v: LocationView) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const set = (p: Partial<LocationView>) => setF((c) => ({ ...c, ...p }));
  return (
    <div className="space-y-3 rounded-lg border border-brand/40 bg-card p-3 shadow-sm" data-testid="local-form">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej.: Tienda centro" />
        </Field>
        <Field label="Dirección" wide>
          <Input value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="Código postal">
          <Input value={f.postalCode} onChange={(e) => set({ postalCode: e.target.value })} />
        </Field>
        <Field label="Ciudad">
          <Input value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label="Provincia">
          <Input value={f.region} onChange={(e) => set({ region: e.target.value })} />
        </Field>
        <Field label="País">
          <Input value={f.country} onChange={(e) => set({ country: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Horario" wide>
          <Input value={f.hours} onChange={(e) => set({ hours: e.target.value })} placeholder="Ej.: L–V 10:00–14:00 y 17:00–20:30" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className={checkClass} checked={f.isPrimary} onChange={(e) => set({ isPrimary: e.target.checked })} />
        Local principal
      </label>
      <div className="flex gap-2">
        <Button size="sm" className={brandBtn} disabled={pending || (!f.name.trim() && !f.address.trim() && !f.city.trim() && !f.phone.trim())} onClick={() => onSave(f)}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    // La etiqueta envuelve el campo: así queda asociada sin necesidad de ids.
    <label className={cn('block space-y-1.5', wide && 'sm:col-span-2')}>
      <span className="flex items-center gap-1 text-sm font-medium leading-none">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}
