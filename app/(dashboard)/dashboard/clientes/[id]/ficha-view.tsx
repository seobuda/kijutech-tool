'use client';

// Ficha del cliente: cabecera (estado, completitud, «Rellenar con IA») y pestañas. La pestaña activa va en la URL
// (?tab=) para poder enlazarla y volver con el botón Atrás.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Brain, Building2, CircleCheck, CircleDashed, Globe, LayoutDashboard, Settings2, Sparkles, Swords, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { ACCESS_LABEL, ASSET_KIND_LABEL, CHANNEL_LABEL, CLIENT_STATUSES, CONTACT_ROLE_LABEL, STATUS_LABEL, type ClientStatus, type MissingItem } from '@/lib/core/client-rules';
import { deleteClientAction, setClientStatusAction } from '@/lib/core/client-actions';
import { AiFill } from '../ai-fill';
import { ClientMemoria } from '../client-memoria';
import { CompletenessBar, STATUS_TONE } from '../clientes-view';
import { AlertLine, MonthWorkButton, OpsForm, type AlertView, type Level, type Member, type OpsView, type Option, type Service, type Space } from '../ops-parts';
import { ConfirmDelete, MsgLine, selectClass, useRun, orDash } from '../ui';
import { EmpresaTab } from './tab-empresa';
import { ContactosTab } from './tab-contactos';
import { WebsTab } from './tab-webs';
import { CompetenciaTab } from './tab-competencia';

export type ClientView = {
  id: string;
  name: string;
  aliases: string[];
  status: string;
  sector: string;
  summary: string;
  logoUrl: string;
  legalName: string;
  taxId: string;
  fiscalAddress: string;
  business: string;
  offerings: string;
  area: string;
  audience: string;
  valueProposition: string;
  brandTone: string;
  goals: string;
  strategy: string;
  notes: string;
  startedAt: string;
  endedAt: string;
  endReason: string;
  updatedAt: string;
};
export type ContractView = { contractServices: string; monthlyFee: number | null; contractStart: string; contractRenewal: string };
export type ContactView = { id: string; name: string; jobTitle: string; role: string; email: string; phone: string; whatsapp: string; preferredChannel: string; isPrimary: boolean; notes: string; active: boolean };
export type LocationView = { id: string; name: string; address: string; city: string; postalCode: string; region: string; country: string; phone: string; hours: string; isPrimary: boolean; notes: string };
export type AssetView = { id: string; kind: string; label: string; value: string; access: string; accessNotes: string; isPrimary: boolean; recognizeEmails: boolean; emailDomain: string; notes: string };
export type CompetitorView = { id: string; name: string; domain: string; notes: string; source: string };

export type FichaData = {
  client: ClientView;
  contract: ContractView | null;
  contacts: ContactView[];
  locations: LocationView[];
  assets: AssetView[];
  competitors: CompetitorView[];
  completeness: { pct: number; missing: MissingItem[] };
  integrations: { google: boolean; dataforseo: boolean };
  ops: OpsView & { clickupOptionLabel: string };
  alert: AlertView;
  levels: Level[];
  services: Service[];
  members: Member[];
  spaces: Space[];
  options: Option[];
  isAdmin: boolean;
};

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'empresa', label: 'Empresa y negocio', icon: Building2 },
  { key: 'contactos', label: 'Contactos', icon: Users },
  { key: 'webs', label: 'Webs y cuentas', icon: Globe },
  { key: 'competencia', label: 'Competencia', icon: Swords },
  { key: 'memoria', label: 'Memoria', icon: Brain },
  { key: 'operaciones', label: 'Operaciones', icon: Settings2 }
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function FichaView({ data }: { data: FichaData }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'resumen';
  const go = (t: TabKey) => router.replace(`${pathname}${t === 'resumen' ? '' : `?tab=${t}`}`, { scroll: false });
  const [showAi, setShowAi] = useState(false);
  const [askBaja, setAskBaja] = useState(false);
  const [reason, setReason] = useState('');
  const { run, pending, msg } = useRun();
  const c = data.client;
  const counts: Partial<Record<TabKey, number>> = { contactos: data.contacts.length + data.locations.length, webs: data.assets.length, competencia: data.competitors.length };

  const changeStatus = (s: string) => {
    if (s === 'baja') return setAskBaja(true);
    run(() => setClientStatusAction(c.id, s), `Estado: ${STATUS_LABEL[s as ClientStatus]}.`);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <Link href="/dashboard/clientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Clientes
      </Link>

      {/* Cabecera */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
            <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{STATUS_LABEL[c.status as ClientStatus] ?? c.status}</Badge>
            {c.sector && <span className="text-sm text-muted-foreground">{c.sector}</span>}
          </div>
          {c.summary && <p className="max-w-3xl text-sm text-foreground/80 text-pretty">{c.summary}</p>}
          {c.aliases.length > 0 && <p className="text-xs text-muted-foreground">También se le llama: {c.aliases.join(', ')}</p>}
          <CompletenessBar pct={data.completeness.pct} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Estado</span>
            <select aria-label="Estado del cliente" className={selectClass} value={c.status} disabled={pending} onChange={(e) => changeStatus(e.target.value)}>
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="outline" className="border-brand/40 text-brand hover:bg-brand-soft hover:text-brand" onClick={() => setShowAi((v) => !v)} aria-expanded={showAi}>
            <Sparkles aria-hidden />
            Rellenar con IA
          </Button>
          {data.isAdmin && <ConfirmDelete what={`la ficha de ${c.name} (con sus contactos, webs, competencia y memoria)`} disabled={pending} onConfirm={() => run(() => deleteClientAction(c.id), 'Ficha eliminada.', () => router.push('/dashboard/clientes'))} />}
        </div>
      </div>
      <MsgLine msg={msg} />

      {askBaja && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium">¿Por qué se va? (opcional; ayuda a entender las bajas)</span>
            <input className={cn(selectClass, 'w-full')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: cierra el negocio, precio, lo lleva otra agencia…" />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => setClientStatusAction(c.id, 'baja', reason), 'Cliente dado de baja.', () => setAskBaja(false))}>
              Dar de baja
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAskBaja(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {showAi && <AiFill clientId={c.id} onClose={() => setShowAi(false)} />}

      {/* Pestañas */}
      <div role="tablist" aria-label="Secciones de la ficha" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              tab === t.key ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
            {counts[t.key] ? <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[t.key]}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === 'resumen' && <Resumen data={data} go={go} />}
        {tab === 'empresa' && <EmpresaTab client={c} contract={data.contract} />}
        {tab === 'contactos' && <ContactosTab clientId={c.id} contacts={data.contacts} locations={data.locations} isAdmin={data.isAdmin} />}
        {tab === 'webs' && <WebsTab clientId={c.id} assets={data.assets} integrations={data.integrations} />}
        {tab === 'competencia' && <CompetenciaTab clientId={c.id} competitors={data.competitors} />}
        {tab === 'memoria' && (
          <div className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
            <ClientMemoria clientId={c.id} />
          </div>
        )}
        {tab === 'operaciones' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
              <AlertLine alert={data.alert} monthlyHours={data.ops.monthlyHours} />
              {data.ops.clickupOptionId && <MonthWorkButton clientId={c.id} name={c.name} />}
            </div>
            <OpsForm clientId={c.id} initial={data.ops} levels={data.levels} services={data.services} members={data.members} spaces={data.spaces} options={data.options} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Resumen -------------------------------------------------------------------------------------------------------

function Resumen({ data, go }: { data: FichaData; go: (t: TabKey) => void }) {
  const c = data.client;
  const primary = data.contacts.find((x) => x.isPrimary && x.active) ?? data.contacts.find((x) => x.active);
  const web = data.assets.find((a) => a.kind === 'web' && a.isPrimary) ?? data.assets.find((a) => a.kind === 'web');
  const loc = data.locations.find((l) => l.isPrimary) ?? data.locations[0];
  const svc = new Map(data.services.map((s) => [s.key, s.label]));
  const people = new Map(data.members.map((m) => [m.id, m.username]));
  const level = data.levels.find((l) => l.key === data.ops.level)?.label ?? data.ops.level;
  const missing = data.completeness.missing;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Contacto principal" onEdit={() => go('contactos')}>
            {primary ? (
              <div className="space-y-0.5 text-sm">
                <p className="font-medium">
                  {primary.name}
                  {primary.jobTitle ? <span className="font-normal text-muted-foreground"> · {primary.jobTitle}</span> : null}
                </p>
                {primary.email && <p>{primary.email}</p>}
                {primary.phone && <p>Tel. {primary.phone}</p>}
                {primary.whatsapp && <p>WhatsApp {primary.whatsapp}</p>}
                <p className="text-xs text-muted-foreground">
                  {CONTACT_ROLE_LABEL[primary.role as keyof typeof CONTACT_ROLE_LABEL] ?? primary.role}
                  {primary.preferredChannel ? ` · prefiere ${CHANNEL_LABEL[primary.preferredChannel as keyof typeof CHANNEL_LABEL] ?? primary.preferredChannel}` : ''}
                </p>
              </div>
            ) : (
              <Empty text="Sin contactos" />
            )}
          </Card>
          <Card title="Web y local" onEdit={() => go('webs')}>
            <div className="space-y-0.5 text-sm">
              {web ? (
                <a href={web.value.startsWith('http') ? web.value : `https://${web.value}`} target="_blank" rel="noopener noreferrer" className="block truncate text-brand hover:underline">
                  {web.value || web.label}
                </a>
              ) : (
                <Empty text="Sin web" />
              )}
              {loc && <p className="text-muted-foreground">{[loc.address, loc.postalCode, loc.city].filter(Boolean).join(', ') || loc.name}</p>}
              {loc?.phone && <p className="text-muted-foreground">Tel. {loc.phone}</p>}
            </div>
          </Card>
        </div>
        <Card title="Negocio" onEdit={() => go('empresa')}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="A qué se dedica" value={c.business} wide />
            <Fact label="Qué vende u ofrece" value={c.offerings} />
            <Fact label="Público" value={c.audience} />
            <Fact label="Zona" value={c.area} />
            <Fact label="Objetivos" value={c.goals} />
            <Fact label="Estrategia" value={c.strategy} wide />
          </dl>
        </Card>
        <Card title="Webs y cuentas" onEdit={() => go('webs')}>
          {data.assets.length ? (
            <ul className="space-y-1 text-sm">
              {data.assets.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{ASSET_KIND_LABEL[a.kind as keyof typeof ASSET_KIND_LABEL] ?? a.kind}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{a.value || a.label}</span>
                  <Badge tone={a.access === 'si' ? 'success' : a.access === 'pendiente' ? 'warning' : a.access === 'no' ? 'danger' : 'neutral'}>{ACCESS_LABEL[a.access as keyof typeof ACCESS_LABEL] ?? a.access}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Todavía no hay webs ni cuentas" />
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Qué falta en la ficha">
          {missing.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CircleCheck className="size-4" aria-hidden />
              Ficha completa. El equipo y los agentes tienen todo lo necesario.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {missing.map((m) => (
                <li key={m.key}>
                  <button type="button" onClick={() => go(m.tab)} className="inline-flex items-center gap-2 text-left hover:text-brand">
                    <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {missing.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Consejo: pulsa «Rellenar con IA» y cuéntaselo en un audio; o pídeselo al Operations manager por Telegram.</p>}
        </Card>
        <Card title="Operaciones" onEdit={() => go('operaciones')}>
          <div className="space-y-2 text-sm">
            <p>
              Nivel <span className="font-medium">{level}</span>
              {data.ops.clickupOptionLabel ? ` · ClickUp «${data.ops.clickupOptionLabel}»` : ' · sin vincular a ClickUp'}
            </p>
            {data.ops.services.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {data.ops.services.map((s) => (
                  <Badge key={s.key} tone="brand">
                    {svc.get(s.key) ?? s.key}
                    {s.responsibleClickupId ? ` · ${people.get(s.responsibleClickupId) ?? '—'}` : ''}
                  </Badge>
                ))}
              </div>
            ) : (
              <Empty text="Sin servicios" />
            )}
            {(c.status === 'activo' || c.status === 'onboarding') && <AlertLine alert={data.alert} monthlyHours={data.ops.monthlyHours} />}
          </div>
        </Card>
        <Card title="Datos">
          <dl className="space-y-1 text-sm">
            <Fact label="Cliente desde" value={c.startedAt} />
            {c.status === 'baja' && <Fact label="Baja" value={[c.endedAt, c.endReason].filter(Boolean).join(' · ')} />}
            <Fact label="Razón social" value={c.legalName} />
            {data.contract && <Fact label="Cuota" value={data.contract.monthlyFee != null ? `${data.contract.monthlyFee.toLocaleString('es-ES')} €/mes` : ''} />}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {onEdit && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
            Ver y editar
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && 'sm:col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('whitespace-pre-line', !value && 'text-muted-foreground')}>{orDash(value)}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
