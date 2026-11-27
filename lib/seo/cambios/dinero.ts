import 'server-only';

// SEO · Páginas de dinero (parte 6, tanda 6b; docs/DISENO-SEO-TECNICO-2BC.md con dos auditorías Opus). Proceso «seo.dinero»
// (cada 6 h por defecto): la portada, las 5 con más clics, las fijadas (como mucho 5) y las de encargos en curso o hechos
// hace menos de 30 días (como mucho 10). Cada pasada: foto estructurada (safeFetcher del núcleo: 2 MB, sin redirecciones),
// cambios al registro, condiciones graves FRENTE A LA REFERENCIA confirmadas a los 30 min, aviso por Telegram si es crítico.
import { and, desc, eq, gte, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, interventions, projects, seoChangeLog, seoMoneyPages, type MoneySnap, type SeoMoneyPage } from '@/lib/db/schema';
import { safeFetcher } from '@/lib/core/crawler';
import { extractPage, normalizeUrl, sameSite, sha1 } from '@/lib/core/crawl-extract';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { emitProjectAlert, telegramOutbound } from '@/lib/core/capabilities';
import { syncFindings, type FindingInput } from '@/lib/core/findings';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { sameUrl } from '@/lib/seo/salud/audit-rules';
import { canAdvanceBaseline, DINERO_KINDS, DINERO_SOURCE, inconclusive, MONEY_LABEL, MONEY_SEVERITY, moneyCondition, snapDiffs, snapOf, type MoneyCondition, type MoneyReason } from '@/lib/seo/cambios/rules';

const CONFIRM_KIND = 'seo.dinero.confirmar';
const CONFIRM_MINUTES = 30;
const TOP_N = 5;
const MAX_PINNED = 5;
const MAX_ENCARGO = 10;
const OUT_DAYS = 28;
type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');

/** Clave del hallazgo: URL, condición y versión de la referencia (tras «Dejar así», un fallo nuevo abre otro). */
export const moneyKey = (urlHash: string, cond: string, version: number) => `seo.money_page_changed:${urlHash.slice(0, 16)}:${cond}:v${version}`;

/** Normaliza y exige que sea de la web del proyecto. null si no. */
export function ownUrl(raw: string, home: string): string | null {
  const u = normalizeUrl(raw.trim(), home);
  return u && sameSite(u, home) ? u : null;
}

async function upsertReason(tenantId: string, projectId: string, url: string, reason: MoneyReason, expiresAt: Date | null): Promise<void> {
  const urlHash = sha1(url);
  const [row] = await db.select().from(seoMoneyPages).where(and(eq(seoMoneyPages.projectId, projectId), eq(seoMoneyPages.urlHash, urlHash))).limit(1);
  if (!row) {
    await db.insert(seoMoneyPages).values({ tenantId, projectId, url, urlHash, reasons: [reason], expiresAt }).onConflictDoNothing();
    return;
  }
  const reasons = [...new Set([...row.reasons, reason])];
  const changed = reasons.length !== row.reasons.length || !row.active || (reason === 'top' && row.outSince) || (expiresAt && (!row.expiresAt || row.expiresAt < expiresAt));
  if (changed) {
    // Al reactivar una página, empieza con referencia nueva (la vieja puede ser de hace meses).
    const reset = !row.active ? { baseline: null, stable: null, last: null, pendingKind: null, pendingSince: null } : {};
    await db.update(seoMoneyPages).set({ reasons, active: true, outSince: reason === 'top' ? null : row.outSince, expiresAt: expiresAt ?? row.expiresAt, updatedAt: new Date(), ...reset }).where(eq(seoMoneyPages.id, row.id));
  }
}

/** Pone al día la lista: portada, top de GSC, encargos. Lo fijado lo pone una persona. */
export async function refreshMoneyList(tenantId: string, projectId: string, home: string, topUrls: string[]): Promise<void> {
  await upsertReason(tenantId, projectId, normalizeUrl(home, home) ?? home, 'home', null);
  const top = topUrls.map((u) => ownUrl(u, home)).filter((u): u is string => Boolean(u)).slice(0, TOP_N);
  for (const u of top) await upsertReason(tenantId, projectId, u, 'top', null);
  // Encargos SEO aprobados (prevista) o hechos hace menos de 30 días: se vigilan desde la aprobación (fecha real del cambio).
  const since = new Date(Date.now() - 30 * 86_400_000);
  const ints = await db
    .select({ urls: interventions.urls, status: interventions.status, doneAt: interventions.doneAt })
    .from(interventions)
    .where(and(eq(interventions.projectId, projectId), eq(interventions.domain, 'seo'), or(eq(interventions.status, 'prevista'), and(eq(interventions.status, 'hecha'), gte(interventions.doneAt, since)))))
    .orderBy(desc(interventions.createdAt))
    .limit(30);
  const encargo = new Map<string, Date | null>();
  for (const i of ints) for (const raw of i.urls) {
    const u = ownUrl(raw, home);
    if (u && !encargo.has(u) && encargo.size < MAX_ENCARGO) encargo.set(u, i.doneAt ? new Date(i.doneAt.getTime() + 30 * 86_400_000) : null);
  }
  for (const [u, exp] of encargo) await upsertReason(tenantId, projectId, u, 'encargo', exp);

  // Quitar motivos que ya no valen (top fuera 4 semanas, encargo caducado) y desactivar si no queda ninguno y no hay nada pendiente.
  const rows = await db.select().from(seoMoneyPages).where(and(eq(seoMoneyPages.projectId, projectId), eq(seoMoneyPages.active, true)));
  const openKeys = new Set(
    (await db.select({ url: findings.url }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.source, DINERO_SOURCE), eq(findings.status, 'abierto')))).map((f) => f.url ?? '')
  );
  const topSet = new Set(top);
  const now = Date.now();
  for (const r of rows) {
    let reasons = [...r.reasons];
    let outSince = r.outSince;
    if (reasons.includes('top') && !topSet.has(r.url)) {
      outSince = outSince ?? new Date();
      if (now - outSince.getTime() > OUT_DAYS * 86_400_000) reasons = reasons.filter((x) => x !== 'top');
    }
    if (reasons.includes('encargo') && !encargo.has(r.url) && (!r.expiresAt || r.expiresAt.getTime() < now)) reasons = reasons.filter((x) => x !== 'encargo');
    if (reasons.includes('home') && !sameUrl(r.url, normalizeUrl(home, home) ?? home)) reasons = reasons.filter((x) => x !== 'home');
    const busy = Boolean(r.pendingKind) || openKeys.has(r.url);
    const active = reasons.length > 0 || busy;
    if (active !== r.active || reasons.length !== r.reasons.length || (outSince?.getTime() ?? 0) !== (r.outSince?.getTime() ?? 0)) {
      await db.update(seoMoneyPages).set({ reasons, active, outSince, updatedAt: new Date() }).where(eq(seoMoneyPages.id, r.id));
    }
  }
}

async function takeSnap(url: string): Promise<MoneySnap> {
  const r = await safeFetcher(url);
  const isHtml = /html/i.test(r.contentType ?? '') && r.status >= 200 && r.status < 300 && Boolean(r.body);
  const page = isHtml ? extractPage(r.body!, url) : null;
  return snapOf(r.status, r.xRobots, page ? { title: page.title, h1: page.h1, canonical: page.canonical, robotsMeta: page.robotsMeta, wordCount: page.wordCount, simhash: page.simhash } : null, new Date());
}

/**
 * Una pasada. confirmPass = la comprobación a los 30 min. Lo pendiente de más de 30 min también se confirma en una pasada
 * normal (si la confirmación falló). Solo resuelve lo de las páginas que pudo leer.
 */
export async function runDinero(tenantId: string, projectId: string, batch: string, confirmPass: boolean, topUrls: () => Promise<string[]>, heartbeat: () => Promise<void> = async () => undefined): Promise<Outcome> {
  const home = await projectWebUrl(tenantId, projectId);
  if (!home) return { status: 'omitido', summary: 'El proyecto no tiene web en su alcance.' };
  if (!confirmPass) await refreshMoneyList(tenantId, projectId, home, await topUrls().catch(() => []));
  const pages = await db.select().from(seoMoneyPages).where(and(eq(seoMoneyPages.projectId, projectId), eq(seoMoneyPages.active, true))).limit(30);
  const toCheck = confirmPass ? pages.filter((p) => p.pendingKind) : pages;
  if (!toCheck.length) return { status: 'ok', summary: confirmPass ? 'Nada pendiente de confirmar.' : 'Sin páginas que vigilar.' };
  const homeUrl = normalizeUrl(home, home) ?? home;
  const [siteDown] = await db.select({ id: findings.id }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.kind, 'seo.site_down'), eq(findings.status, 'abierto'))).limit(1);
  const regressed = new Set(
    (await db.select({ url: findings.url }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.kind, 'seo.page_regressed'), eq(findings.status, 'abierto')))).map((f) => f.url ?? '')
  );
  const openMoney = await db.select({ dedupeKey: findings.dedupeKey, url: findings.url, severity: findings.severity, evidence: findings.evidence, kind: findings.kind }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.source, DINERO_SOURCE), eq(findings.status, 'abierto')));

  const out: FindingInput[] = [];
  const newCritical: string[] = [];
  let read = 0;
  let needConfirm = false;
  const now = new Date();
  for (const p of toCheck) {
    await heartbeat();
    const snap = await takeSnap(p.url);
    const isHome = sameUrl(p.url, homeUrl);
    if (inconclusive(snap)) {
      // No se sabe: se mantiene lo abierto de esta página tal cual.
      for (const f of openMoney.filter((f) => f.url === p.url && f.kind === 'seo.money_page_changed')) out.push({ kind: f.kind, dedupeKey: f.dedupeKey, url: f.url, severity: f.severity as FindingInput['severity'], evidence: (f.evidence ?? {}) as Record<string, unknown> });
      await db.update(seoMoneyPages).set({ failStreak: p.failStreak + 1, lastCheckedAt: now, updatedAt: now }).where(eq(seoMoneyPages.id, p.id));
      continue;
    }
    read++;
    const baseline = p.baseline ?? snap;
    const last = p.last ?? snap;
    // Registro de cambios (frente a la última foto; el texto, frente a la estable).
    const diffs = p.last ? snapDiffs(last, snap, p.stable ?? null) : [];
    if (diffs.length) {
      await db
        .insert(seoChangeLog)
        .values(diffs.map((d) => ({ tenantId, projectId, url: p.url, urlHash: p.urlHash, field: d.field, before: d.before, after: d.after, source: 'dinero', batch, prevObservedAt: p.lastCheckedAt ?? null, detectedAt: now })))
        .onConflictDoNothing();
    }
    const rawCond = moneyCondition(baseline, snap, isHome, sameUrl, p.url);
    let cond: MoneyCondition | null = rawCond;
    // Estado o noindex con «página que funcionaba y ahora no» ya abierto: no se repite (pero la referencia no avanza).
    if (cond && (cond === 'estado' || cond === 'noindex' || cond === 'redireccion') && regressed.has(p.url)) cond = null;
    let pendingKind = p.pendingKind;
    let pendingSince = p.pendingSince;
    if (cond) {
      const ripe = pendingKind === cond && pendingSince && now.getTime() - pendingSince.getTime() >= (CONFIRM_MINUTES - 5) * 60_000;
      if (ripe) {
        const key = moneyKey(p.urlHash, cond, p.baselineVersion);
        out.push({ kind: 'seo.money_page_changed', dedupeKey: key, url: p.url, severity: MONEY_SEVERITY[cond], evidence: { cond, label: MONEY_LABEL[cond], reasons: p.reasons, before: baseline, now: snap } });
        if (MONEY_SEVERITY[cond] === 'critico' && !openMoney.some((f) => f.dedupeKey === key)) newCritical.push(`${p.url} ${MONEY_LABEL[cond]}`);
      } else if (pendingKind !== cond) {
        pendingKind = cond;
        pendingSince = now;
        needConfirm = true;
      } else needConfirm = true;
    } else {
      pendingKind = null;
      pendingSince = null;
    }
    const advance = !rawCond && canAdvanceBaseline(baseline, snap);
    const contentLogged = diffs.some((d) => d.field === 'content');
    await db
      .update(seoMoneyPages)
      .set({
        last: snap,
        baseline: p.baseline ? (advance ? snap : p.baseline) : snap,
        stable: !p.stable || contentLogged || advance ? snap : p.stable,
        pendingKind,
        pendingSince,
        failStreak: 0,
        lastCheckedAt: now,
        updatedAt: now
      })
      .where(eq(seoMoneyPages.id, p.id));
  }
  // Ninguna página legible (y la web no está caída, que ya lo avisa la vigilancia): un solo aviso de proyecto.
  const failing = pages.filter((p) => p.failStreak + (toCheck.includes(p) && read === 0 ? 1 : 0) >= 4);
  if (!confirmPass && read === 0 && !siteDown && failing.length === pages.length && pages.length) {
    out.push({ kind: 'seo.money_pages_unreadable', dedupeKey: 'seo.money_pages_unreadable:web', url: homeUrl, severity: 'info', evidence: { pages: pages.length } });
  }
  // Solo decide sobre lo que pudo mirar: en la confirmación, se conserva lo abierto de las páginas no revisadas.
  const checked = new Set(toCheck.map((p) => p.url));
  for (const f of openMoney) if (!checked.has(f.url ?? '') || (f.kind === 'seo.money_pages_unreadable' && (confirmPass || read === 0))) out.push({ kind: f.kind, dedupeKey: f.dedupeKey, url: f.url, severity: f.severity as FindingInput['severity'], evidence: (f.evidence ?? {}) as Record<string, unknown> });
  await syncFindings(tenantId, projectId, DINERO_SOURCE, out, DINERO_KINDS);

  if (needConfirm) {
    const job = { tenantId, kind: CONFIRM_KIND, payload: { projectId }, scopeType: 'proyecto' as const, scopeId: projectId, priority: 2, runAt: new Date(Date.now() + CONFIRM_MINUTES * 60_000) };
    // Si ya hay una confirmación en cola o en marcha (p. ej. esta misma), otra con su minuto: la nueva condición no espera 6 h.
    const r = await enqueueJob({ ...job, dedupeKey: `${CONFIRM_KIND}:${projectId}` });
    if (!r.created) await enqueueJob({ ...job, dedupeKey: `${CONFIRM_KIND}:${projectId}:${Math.floor(Date.now() / 60_000)}` });
  }
  if (newCritical.length) {
    const [pr] = await db.select({ name: projects.name, clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    const link = BASE_URL() ? `\n<a href="${BASE_URL()}/dashboard/projects/${projectId}/salud">Abrir la Salud del proyecto</a>` : '';
    await telegramOutbound()?.notifyOwner(tenantId, `seo.dinero:${projectId}:${newCritical.map((c) => sha1(c).slice(0, 8)).sort().join('|')}`, `🚨 <b>${esc(pr?.name ?? 'Proyecto')}</b>: página importante con problema (confirmado)\n${newCritical.map((c) => `• ${esc(c)}`).join('\n')}${link}`);
    if (pr?.clientId) await emitProjectAlert({ tenantId, clientId: pr.clientId, projectId, title: `Página importante con problema: ${newCritical[0]}`.slice(0, 300), source: 'seo.dinero' });
  }
  const alerts = out.filter((f) => f.kind === 'seo.money_page_changed').length;
  return {
    status: alerts || needConfirm ? 'aviso' : 'ok',
    summary: `${read} de ${toCheck.length} página(s) leídas${needConfirm ? ' · algo cambió: se confirma en 30 min' : ''}${alerts ? ` · ${alerts} con problema` : ''}`
  };
}

/** «Dejar así» / «No es un problema» en un aviso de dinero: la foto actual pasa a ser la referencia (nueva versión). */
export async function acceptMoneyBaseline(projectId: string, url: string | null): Promise<void> {
  if (!url) return;
  const [p] = await db.select().from(seoMoneyPages).where(and(eq(seoMoneyPages.projectId, projectId), eq(seoMoneyPages.urlHash, sha1(url)))).limit(1);
  if (!p?.last) return;
  await db.update(seoMoneyPages).set({ baseline: p.last, stable: p.last, baselineVersion: p.baselineVersion + 1, pendingKind: null, pendingSince: null, updatedAt: new Date() }).where(eq(seoMoneyPages.id, p.id));
}

export async function pinMoneyPage(tenantId: string, projectId: string, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const home = await projectWebUrl(tenantId, projectId);
  if (!home) return { ok: false, error: 'El proyecto no tiene web en su alcance.' };
  const url = ownUrl(raw, home);
  if (!url) return { ok: false, error: 'Tiene que ser una página de la web del proyecto.' };
  const pinned = await db.select({ id: seoMoneyPages.id, reasons: seoMoneyPages.reasons }).from(seoMoneyPages).where(and(eq(seoMoneyPages.projectId, projectId), eq(seoMoneyPages.active, true)));
  if (pinned.filter((p) => p.reasons.includes('pinned')).length >= MAX_PINNED) return { ok: false, error: `Como mucho ${MAX_PINNED} páginas fijadas.` };
  await upsertReason(tenantId, projectId, url, 'pinned', null);
  return { ok: true };
}

export async function unpinMoneyPage(projectId: string, id: string): Promise<boolean> {
  const [p] = await db.select().from(seoMoneyPages).where(and(eq(seoMoneyPages.id, id), eq(seoMoneyPages.projectId, projectId))).limit(1);
  if (!p) return false;
  const reasons = p.reasons.filter((r) => r !== 'pinned');
  await db.update(seoMoneyPages).set({ reasons, active: reasons.length > 0 || Boolean(p.pendingKind), updatedAt: new Date() }).where(eq(seoMoneyPages.id, p.id));
  return true;
}

export type MoneyView = { id: string; url: string; reasons: string[]; lastCheckedAt: string | null; status: number | null; indexable: boolean | null; title: string | null; pending: string | null; failStreak: number };
export async function listMoneyPages(tenantId: string, projectId: string): Promise<MoneyView[]> {
  const rows: SeoMoneyPage[] = await db.select().from(seoMoneyPages).where(and(eq(seoMoneyPages.tenantId, tenantId), eq(seoMoneyPages.projectId, projectId), eq(seoMoneyPages.active, true)));
  const order = (r: SeoMoneyPage) => (r.reasons.includes('home') ? 0 : r.reasons.includes('pinned') ? 1 : r.reasons.includes('top') ? 2 : 3);
  return rows
    .sort((a, b) => order(a) - order(b) || a.url.localeCompare(b.url))
    .map((r) => ({ id: r.id, url: r.url, reasons: r.reasons, lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null, status: r.last?.status ?? null, indexable: r.last?.indexable ?? null, title: r.last?.title ?? null, pending: r.pendingKind, failStreak: r.failStreak }));
}

let registered = false;
/** Trabajo de confirmación (el proceso «seo.dinero» lo registra la vigilancia con su patrón). */
export function registerDineroConfirm(topUrls: (tenantId: string, projectId: string) => Promise<string[]>): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: CONFIRM_KIND, timeoutS: 300, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, payload) => runDinero(ctx.tenantId, String(payload.projectId ?? ''), `dinero:${ctx.job.id}`, true, () => topUrls(ctx.tenantId, String(payload.projectId ?? '')), ctx.heartbeat) });
}

