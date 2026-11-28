import 'server-only';

// Módulo Google Ads · lo que decide el gestor en el paso 2 (funciones internas; las acciones 'use server' comprueban el
// permiso antes de llamarlas): responder a un hallazgo (7.4), marcar una cuenta como revisada y fijar el objetivo
// provisional congelado (2.2, §7). Nada de esto escribe en Google Ads.
import { workSource } from '@/lib/core/capabilities';
import { nextReviewDate, provisionalGoal, responseEffect } from '@/lib/ads/finding-rules';
import * as fs from '@/lib/ads/findings-store';
import { addDays, zonedParts } from '@/lib/ads/rules';
import { clientLevels, getAccount, getSettingsRow } from '@/lib/ads/store';

export class AdsDecisionError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdsDecisionError';
  }
}

type Who = { id: number; name: string | null; email: string };
const today = (now: Date) => zonedParts(now, 'Europe/Madrid').date;

/** Responder a un hallazgo. Devuelve el mensaje de «qué pasa ahora». */
export async function respondToFinding(tenantId: string, user: Who, findingId: string, kind: string, input: { reason?: string | null; until?: string | null; days?: number | null }, now: Date = new Date()): Promise<{ message: string; taskUrl?: string | null }> {
  const f = await fs.getFinding(tenantId, findingId);
  if (!f) throw new AdsDecisionError('Ese hallazgo ya no existe.');
  if (f.status !== 'abierto' && f.status !== 'silenciado') throw new AdsDecisionError('Ese hallazgo ya está cerrado.');
  const postpones = await fs.countResponses(f.id, 'posponer');
  const r = responseEffect(kind, input, { now, today: today(now), postpones });
  if (!r.ok) throw new AdsDecisionError(r.error);
  let message = r.effect.message;
  let taskUrl: string | null = null;
  let reason = r.effect.reason;
  // «Encargar»: si la cuenta tiene cliente y hay fuente de trabajo, se crea el encargo; si no, queda anotado.
  if (kind === 'encargar') {
    const acc = f.accountId ? await getAccount(tenantId, f.accountId) : null;
    const ws = workSource();
    if (acc?.clientId && !acc.simulated && ws?.createTask) {
      const lines = ((f.evidence as { lines?: string[] }).lines ?? []).map((l) => `- ${l}`).join('\n');
      const res = await ws.createTask(tenantId, { clientId: acc.clientId, title: `Google Ads: ${f.title}`.slice(0, 200), description: `${f.title}\n\n${lines}\n\nHallazgo de Google Ads (la herramienta no cambia nada en Google Ads: el cambio se hace a mano).`, workType: null, requestedBy: user.name || user.email, dueDate: r.effect.until, origin: 'Hallazgo de Google Ads' });
      if (!res.ok) throw new AdsDecisionError(res.message || 'No se pudo crear el encargo.');
      taskUrl = res.url;
      reason = [reason, res.ref ? `encargo ${res.ref}` : null].filter(Boolean).join(' · ') || null;
      message = `Encargo creado. ${message}`;
    } else {
      message = `${acc?.simulated ? 'Cuenta simulada: no se crea un encargo real.' : !acc?.clientId ? 'La cuenta no tiene cliente vinculado: no se crea el encargo.' : 'No hay fuente de encargos conectada.'} Queda anotado. ${message}`;
    }
  }
  await fs.insertResponse({ tenantId, findingId: f.id, userId: user.id, response: kind, reason, until: r.effect.until });
  await fs.updateFinding(tenantId, f.id, { status: r.effect.status, silencedUntil: r.effect.silencedUntil, ...(r.effect.status === 'descartado' ? { resolvedAt: now } : {}) });
  return { message, taskUrl };
}

/** «Marcar revisada»: nota de una línea y próxima revisión según el nivel del cliente (A 7, B 14, C 30 días). */
export async function reviewAccount(tenantId: string, user: Who, accountId: string, note: string, now: Date = new Date()): Promise<{ next: string }> {
  const acc = await getAccount(tenantId, accountId);
  if (!acc) throw new AdsDecisionError('Esa cuenta no existe.');
  const clean = String(note ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length < 3) throw new AdsDecisionError('Escribe una nota de una línea (qué viste o qué decidiste).');
  if (clean.length > 200) throw new AdsDecisionError('La nota es de una línea: como mucho 200 caracteres.');
  const level = acc.clientId ? ((await clientLevels(tenantId)).get(acc.clientId) ?? null) : null;
  const next = nextReviewDate(today(now), level);
  await fs.insertReview({ tenantId, accountId, reviewedBy: user.id, note: clean, reviewedAt: now, nextReviewOn: next });
  return { next };
}

/**
 * «Fijar objetivo provisional» (por cliente, congelado): coste / conversiones primarias de los 90 días previos sin los 7
 * últimos, de todas las cuentas del cliente (misma moneda). Con menos de 15 conversiones no se fija. Un cliente de nivel
 * A no puede tener objetivo provisional (necesita uno acordado).
 */
export async function setProvisionalGoal(tenantId: string, user: Who, accountId: string, now: Date = new Date()): Promise<{ cpl: number; monthly: number; conversions: number; currency: string | null }> {
  const acc = await getAccount(tenantId, accountId);
  if (!acc) throw new AdsDecisionError('Esa cuenta no existe.');
  if (acc.simulated) throw new AdsDecisionError('Las cuentas simuladas no tienen cliente: el objetivo es del cliente.');
  if (!acc.clientId) throw new AdsDecisionError('Vincula antes la cuenta con su cliente (Ajustes de Google Ads).');
  const settings = await getSettingsRow(tenantId);
  if (!settings || settings.authMode === 'sim') throw new AdsDecisionError('Con datos simulados no se fijan objetivos.');
  const level = (await clientLevels(tenantId)).get(acc.clientId) ?? null;
  if (level === 'A') throw new AdsDecisionError('Un cliente de nivel A necesita un objetivo acordado: baja el nivel a B en Ajustes si quieres fijar uno provisional.');
  const existing = await fs.latestGoal(tenantId, acc.clientId);
  if (existing) throw new AdsDecisionError(existing.kind === 'provisional' ? 'Ya tiene un objetivo provisional congelado.' : 'Ya tiene un objetivo acordado con el cliente.');
  const accounts = (await fs.accountsOfClient(tenantId, acc.clientId)).filter((a) => !a.simulated);
  const currencies = [...new Set(accounts.map((a) => a.currency).filter(Boolean))];
  if (currencies.length > 1) throw new AdsDecisionError(`Las cuentas de este cliente usan monedas distintas (${currencies.join(', ')}): no se pueden sumar.`);
  const t = today(now);
  const rows = await fs.dailyTotalsByAccount(accounts.map((a) => a.id), addDays(t, -100), t);
  const g = provisionalGoal(rows, t);
  if (!g.ok) throw new AdsDecisionError(g.error);
  await fs.insertGoal({
    tenantId,
    clientId: acc.clientId,
    version: 1,
    kind: 'provisional',
    cplMax: g.cpl.toFixed(2),
    budgetUsual: g.monthly.toFixed(2),
    validFrom: t,
    frozenBaselineFrom: g.from,
    frozenBaselineTo: g.to,
    dataQuality: { conversions: g.conversions, cost: g.cost, accounts: accounts.length, excluded: 'últimos 7 días (conversiones aún por madurar)', currency: currencies[0] ?? null },
    notes: 'Supuesto: línea base de los 90 días previos (coste total / conversiones primarias). No es un objetivo de negocio: sustituir por el acordado con el cliente.',
    agreedBy: null,
    createdBy: user.id
  });
  return { cpl: g.cpl, monthly: g.monthly, conversions: g.conversions, currency: currencies[0] ?? null };
}

