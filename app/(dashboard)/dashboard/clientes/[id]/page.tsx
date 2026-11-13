import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db/drizzle';
import { opsClientActivity } from '@/lib/db/schema';
import { completeness } from '@/lib/core/client-rules';
import { getClientSheet } from '@/lib/core/clients';
import { getStructure, selectedSpaces } from '@/lib/operaciones/structure';
import { evaluateClient, getLevels, getServices, listClients } from '@/lib/operaciones/clients';
import { isConnected } from '@/lib/agentes/integrations';
import { FichaView, type FichaData } from './ficha-view';

export const dynamic = 'force-dynamic';

// Ficha del cliente (NÚCLEO, 14 nov 2026): pestañas Resumen, Empresa y negocio, Contactos, Webs y cuentas, Competencia,
// Memoria y Operaciones. El contrato (cuota y fechas) solo llega al navegador de un administrador.
export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission('edit');
  const { id } = await params;
  const sheet = await getClientSheet(user.tenantId, id);
  if (!sheet) notFound();

  const [isAdmin, levels, services, structure, opsList, activity, google, dataforseo] = await Promise.all([
    checkPermission('admin').then((r) => r.ok),
    getLevels(user.tenantId),
    getServices(user.tenantId),
    getStructure(user.tenantId),
    listClients(user.tenantId),
    db.select().from(opsClientActivity).where(and(eq(opsClientActivity.tenantId, user.tenantId), eq(opsClientActivity.clientId, id))).limit(1),
    isConnected(user.tenantId, 'google').catch(() => false),
    isConnected(user.tenantId, 'dataforseo').catch(() => false)
  ]);
  const ops = opsList.find((c) => c.id === id)!;
  const act = activity[0] ?? null;
  const ev = evaluateClient(ops, act, levels, Date.now());
  const c = sheet.client;
  const comp = completeness(sheet);
  const options = new Map<string, string>();
  for (const f of Object.values(structure.clientFields)) for (const o of f.options) options.set(o.id, o.label);

  const data: FichaData = {
    client: {
      id: c.id,
      name: c.name,
      aliases: c.aliases,
      status: c.status,
      sector: c.sector ?? '',
      summary: c.summary ?? '',
      logoUrl: c.logoUrl ?? '',
      legalName: c.legalName ?? '',
      taxId: c.taxId ?? '',
      fiscalAddress: c.fiscalAddress ?? '',
      business: c.business ?? '',
      offerings: c.offerings ?? '',
      area: c.area ?? '',
      audience: c.audience ?? '',
      valueProposition: c.valueProposition ?? '',
      brandTone: c.brandTone ?? '',
      goals: c.goals ?? '',
      strategy: c.strategy ?? '',
      notes: c.notes ?? '',
      startedAt: c.startedAt ?? '',
      endedAt: c.endedAt ?? '',
      endReason: c.endReason ?? '',
      updatedAt: c.updatedAt.toISOString()
    },
    contract: isAdmin
      ? { contractServices: c.contractServices ?? '', monthlyFee: c.monthlyFee != null ? Number(c.monthlyFee) : null, contractStart: c.contractStart ?? '', contractRenewal: c.contractRenewal ?? '' }
      : null,
    contacts: sheet.contacts.map((x) => ({ id: x.id, name: x.name, jobTitle: x.jobTitle ?? '', role: x.role, email: x.email ?? '', phone: x.phone ?? '', whatsapp: x.whatsapp ?? '', preferredChannel: x.preferredChannel ?? '', isPrimary: x.isPrimary, notes: x.notes ?? '', active: x.active })),
    locations: sheet.locations.map((x) => ({ id: x.id, name: x.name ?? '', address: x.address ?? '', city: x.city ?? '', postalCode: x.postalCode ?? '', region: x.region ?? '', country: x.country ?? '', phone: x.phone ?? '', hours: x.hours ?? '', isPrimary: x.isPrimary, notes: x.notes ?? '' })),
    assets: sheet.assets.map((x) => ({ id: x.id, kind: x.kind, label: x.label ?? '', value: x.value ?? '', access: x.access, accessNotes: x.accessNotes ?? '', isPrimary: x.isPrimary, recognizeEmails: Boolean(x.emailDomain), emailDomain: x.emailDomain ?? '', notes: x.notes ?? '' })),
    competitors: sheet.competitors.map((x) => ({ id: x.id, name: x.name, domain: x.domain ?? '', notes: x.notes ?? '', source: x.source })),
    completeness: comp,
    integrations: { google, dataforseo },
    ops: {
      clickupOptionId: ops.clickupOptionId ?? '',
      clickupOptionLabel: ops.clickupOptionLabel ?? '',
      usualSpaceId: ops.usualSpaceId ?? '',
      usualListIds: ops.usualListIds,
      level: ops.level,
      deliveryDays: ops.deliveryDays,
      inactivityDays: ops.inactivityDays,
      planningDays: ops.planningDays,
      alertsEnabled: ops.alertsEnabled,
      monthlyHours: ops.monthlyHours != null ? Number(ops.monthlyHours) : null,
      workDays: ops.workDays ? ops.workDays.split(',').map(Number).filter((d) => d >= 1 && d <= 7) : [],
      services: ops.services.map((s) => ({ key: s.serviceKey, responsibleClickupId: s.responsibleClickupId ?? '' }))
    },
    alert: {
      state: ev.state,
      note: ev.note,
      lastActivityDays: act?.lastActivityMs ? Math.floor((Date.now() - act.lastActivityMs) / 86_400_000) : null,
      hasData: Boolean(act),
      windowDays: act?.windowDays ?? 0,
      hoursMonth: act ? Number(act.hoursMonth) : 0,
      completedMonth: act?.completedMonth ?? 0,
      upcoming: act?.upcomingTasks ?? 0,
      horizonDays: act?.horizonDays ?? 0
    },
    levels,
    services,
    members: structure.members.map((m) => ({ id: m.id, username: m.username })),
    spaces: selectedSpaces(structure).map((s) => ({ id: s.id, name: s.name, lists: s.lists.map((l) => ({ id: l.id, name: l.folder ? `${l.folder} / ${l.name}` : l.name })) })),
    options: [...options].map(([oid, label]) => ({ id: oid, label })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    isAdmin
  };
  return <FichaView data={data} />;
}
