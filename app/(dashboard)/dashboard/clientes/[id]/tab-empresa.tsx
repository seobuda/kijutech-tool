'use client';

// Pestaña «Empresa y negocio»: identidad, datos de empresa, negocio, estrategia y (solo administradores) contrato.
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/page';
import { saveClientContractAction, saveClientProfileAction } from '@/lib/core/client-actions';
import { areaClass, brandBtn, fieldHint, FormSection, MsgLine, useRun } from '../ui';
import type { ClientView, ContractView } from './ficha-view';

type Profile = Omit<ClientView, 'id' | 'status' | 'endedAt' | 'endReason' | 'updatedAt'>;

export function EmpresaTab({ client, contract }: { client: ClientView; contract: ContractView | null }) {
  const pick = (c: ClientView): Profile => ({
    name: c.name,
    aliases: c.aliases,
    sector: c.sector,
    summary: c.summary,
    logoUrl: c.logoUrl,
    legalName: c.legalName,
    taxId: c.taxId,
    fiscalAddress: c.fiscalAddress,
    business: c.business,
    offerings: c.offerings,
    area: c.area,
    audience: c.audience,
    valueProposition: c.valueProposition,
    brandTone: c.brandTone,
    goals: c.goals,
    strategy: c.strategy,
    notes: c.notes,
    startedAt: c.startedAt
  });
  const [f, setF] = useState<Profile>(pick(client));
  const [aliasText, setAliasText] = useState(client.aliases.join(', '));
  const [dirty, setDirty] = useState(false);
  const { run, pending, msg } = useRun();
  const set = (patch: Partial<Profile>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = () =>
    run(
      () => saveClientProfileAction(client.id, { ...f, aliases: aliasText.split(',').map((a) => a.trim()).filter(Boolean) }),
      'Ficha guardada.',
      () => setDirty(false)
    );

  const text = (id: keyof Profile, label: string, rows = 3, placeholder?: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`e-${id}`}>{label}</Label>
      <textarea id={`e-${id}`} rows={rows} className={areaClass} placeholder={placeholder} value={String(f[id] ?? '')} onChange={(e) => set({ [id]: e.target.value } as Partial<Profile>)} />
      {hint && <p className={fieldHint}>{hint}</p>}
    </div>
  );
  const line = (id: keyof Profile, label: string, placeholder?: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label htmlFor={`e-${id}`}>{label}</Label>
      <Input id={`e-${id}`} type={type} placeholder={placeholder} value={String(f[id] ?? '')} onChange={(e) => set({ [id]: e.target.value } as Partial<Profile>)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card shadow-xs" data-testid="empresa-form">
        <FormSection title="Identidad" description="Cómo se llama y cómo lo reconocen el equipo y los agentes.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-name" className="gap-1">
                Nombre comercial <span className="text-destructive">*</span>
              </Label>
              <Input id="e-name" aria-required value={f.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            {line('sector', 'Sector', 'Ej.: tienda de deportes, clínica dental…')}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="e-aliases">Nombres alternativos (separados por comas)</Label>
              <Input
                id="e-aliases"
                placeholder="Ej.: plupilates, club pilates, cp"
                value={aliasText}
                onChange={(e) => {
                  setAliasText(e.target.value);
                  setDirty(true);
                }}
              />
              <p className={fieldHint}>Variantes, dominio y errores de dictado: así se reconoce al cliente en notas, correos y audios.</p>
            </div>
          </div>
          {text('summary', 'Resumen en una frase', 2, 'Ej.: Tienda de deportes de Valencia con venta online que quiere captar clientes por formulario.')}
        </FormSection>

        <FormSection title="Negocio" description="Contexto que usan el equipo, los encargos, los correos y los agentes.">
          {text('business', 'A qué se dedica', 3)}
          <div className="grid gap-4 sm:grid-cols-2">
            {text('offerings', 'Qué vende u ofrece', 3)}
            {text('audience', 'Público objetivo', 3)}
          </div>
          {line('area', 'Zona en la que trabaja', 'Ej.: Valencia y alrededores')}
          {text('valueProposition', 'Propuesta de valor', 2, 'Qué le diferencia de la competencia')}
          {text('brandTone', 'Tono y marca', 2, 'Cómo habla la marca y cómo le gusta que le traten', 'Lo tienen en cuenta los textos y las respuestas a sus correos.')}
        </FormSection>

        <FormSection title="Objetivos y estrategia" description="Qué quiere conseguir y qué estamos haciendo para lograrlo.">
          {text('goals', 'Objetivos', 2, 'Ej.: 30 leads al mes desde la web')}
          {text('strategy', 'Estrategia actual', 3)}
          {text('notes', 'Peculiaridades y notas', 3)}
        </FormSection>

        <FormSection title="Empresa" description="Datos para facturas y documentos. Sin contraseñas ni datos personales que no hagan falta.">
          <div className="grid gap-4 sm:grid-cols-2">
            {line('legalName', 'Razón social')}
            {line('taxId', 'CIF')}
          </div>
          {text('fiscalAddress', 'Dirección fiscal', 2)}
          <div className="grid gap-4 sm:grid-cols-2">
            {line('startedAt', 'Cliente desde', '', 'date')}
            {line('logoUrl', 'Logo (URL)', 'https://…')}
          </div>
        </FormSection>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
          <Button size="sm" className={brandBtn} disabled={pending || !dirty || !f.name.trim()} onClick={save}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
          {dirty && (
            <Badge tone="warning" dot>
              Cambios sin guardar
            </Badge>
          )}
          <MsgLine msg={msg} />
        </div>
      </div>

      {contract && <ContractForm clientId={client.id} initial={contract} />}
    </div>
  );
}

function ContractForm({ clientId, initial }: { clientId: string; initial: ContractView }) {
  const [f, setF] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const { run, pending, msg } = useRun();
  const set = (p: Partial<ContractView>) => {
    setF((c) => ({ ...c, ...p }));
    setDirty(true);
  };
  return (
    <div className="rounded-xl border bg-card shadow-xs" data-testid="contrato-form">
      <FormSection
        title="Contrato"
        description={
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" aria-hidden /> Solo lo ven los administradores.
          </span>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="k-services">Servicios contratados</Label>
          <textarea id="k-services" rows={2} className={areaClass} value={f.contractServices} onChange={(e) => set({ contractServices: e.target.value })} placeholder="Ej.: SEO local + mantenimiento web" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="k-fee">Cuota mensual (€)</Label>
            <Input id="k-fee" type="number" min={0} step={10} value={f.monthlyFee ?? ''} onChange={(e) => set({ monthlyFee: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="k-start">Inicio</Label>
            <Input id="k-start" type="date" value={f.contractStart} onChange={(e) => set({ contractStart: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="k-renew">Renovación</Label>
            <Input id="k-renew" type="date" value={f.contractRenewal} onChange={(e) => set({ contractRenewal: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className={brandBtn} disabled={pending || !dirty} onClick={() => run(() => saveClientContractAction(clientId, f), 'Contrato guardado.', () => setDirty(false))}>
            Guardar contrato
          </Button>
          <MsgLine msg={msg} />
        </div>
      </FormSection>
    </div>
  );
}
