import 'server-only';
// Estado del sistema para el departamento de Sistema (organigrama, 20 nov 2026). Sin IA: son lecturas y cuentas.
//   - estado_sistema: la herramienta del jefe de Sistema (salud, pruebas, errores, gasto de IA, servidor, vigilante).
//   - Parte de Sistema: el mismo informe, una vez al día a la hora del panel, por el chat de Sistema y sin sonido.
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsHealthIncidents, opsNotifications, opsSettings } from '@/lib/db/schema';
import { moduleHealthChecks, SYSTEM_BOT, type AgentTool } from '@/lib/core/capabilities';
import { defaultTenantId } from '@/lib/core/errors';
import { collectSnapshot, evaluate } from '@/lib/operaciones/health';
import { getAiOverview } from '@/lib/operaciones/ai-watch';
import { getInfraOverview } from '@/lib/operaciones/infra-watch';
import { getAuto, num } from '@/lib/operaciones/automations';
import { enqueueNotification, localParts, toMinutes } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { getOwnerTimezone } from '@/lib/operaciones/team-profiles';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { promptEvalOverview } from '@/lib/ai/prompt-evals';

export const SYSTEM_SECTIONS = ['salud', 'pruebas', 'errores', 'gasto', 'servidor'] as const;
export type SystemSection = (typeof SYSTEM_SECTIONS)[number];

const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;
const ago = (d: Date, now: number) => {
  const m = Math.max(0, Math.round((now - d.getTime()) / 60_000));
  return m < 60 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};

export type SystemReport = {
  attention: number; // cosas que piden atención (para el titular del parte)
  sections: Record<SystemSection, string[]>;
};

/** Lee el estado de cada parte del sistema. Cada sección va aislada: si una falla, las demás salen igual. */
export async function buildSystemReport(tenantId: string, now = new Date(), only?: SystemSection[]): Promise<SystemReport> {
  const want = (s: SystemSection) => !only?.length || only.includes(s);
  const t = now.getTime();
  const since24 = new Date(t - 86_400_000);
  const sections = { salud: [], pruebas: [], errores: [], gasto: [], servidor: [] } as Record<SystemSection, string[]>;
  let attention = 0;
  const safe = async (s: SystemSection, fn: () => Promise<void>) => {
    if (!want(s)) return;
    try {
      await fn();
    } catch (e) {
      sections[s].push(`No se pudo leer (${e instanceof Error ? e.message.slice(0, 120) : 'error'}).`);
    }
  };

  await safe('salud', async () => {
    const checks = [...evaluate(await collectSnapshot(tenantId)), ...(await moduleHealthChecks(tenantId))];
    const bad = checks.filter((c) => c.status !== 'ok');
    attention += bad.filter((c) => c.status === 'critico').length;
    if (!bad.length) sections.salud.push(`Todo en orden (${checks.length} comprobaciones).`);
    for (const c of bad) sections.salud.push(`${c.status === 'critico' ? '🔴' : '🟠'} ${c.label}: ${c.detail}`);
    const resolved = await db
      .select({ title: opsHealthIncidents.title })
      .from(opsHealthIncidents)
      .where(and(eq(opsHealthIncidents.tenantId, tenantId), gte(opsHealthIncidents.resolvedAt, since24)));
    if (resolved.length) sections.salud.push(`Resueltas en 24 h: ${resolved.map((r) => r.title).join(', ')}.`);
    const wd = await db
      .select({ key: opsSettings.key, value: opsSettings.value })
      .from(opsSettings)
      .where(and(eq(opsSettings.tenantId, tenantId), sql`${opsSettings.key} IN ('watchdog_seen_at', 'watchdog_status')`));
    const seen = wd.find((w) => w.key === 'watchdog_seen_at')?.value;
    if (seen) sections.salud.push(`Vigilante externo: última pasada ${ago(new Date(seen), t)}${wd.find((w) => w.key === 'watchdog_status')?.value === 'sin_config' ? ' (sin configuración: no puede avisar)' : ''}.`);
  });

  await safe('pruebas', async () => {
    const latest = (await db.execute(sql`
      SELECT DISTINCT ON (scenario_key) scenario_key, status, trigger, commit, started_at
      FROM ops_sim_runs WHERE tenant_id = ${tenantId} AND status <> 'en_curso'
      ORDER BY scenario_key, started_at DESC`)) as unknown as { scenario_key: string; status: string; trigger: string; commit: string | null; started_at: Date }[];
    if (!latest.length) return void sections.pruebas.push('Todavía no se han ejecutado pruebas simuladas.');
    const failing = latest.filter((r) => r.status === 'fallo');
    attention += failing.length;
    sections.pruebas.push(failing.length ? `🔴 Fallan ${failing.length} de ${latest.length}: ${failing.map((r) => r.scenario_key).join(', ')}.` : `Las ${latest.length} pasan.`);
    const [deploy] = (await db.execute(sql`
      SELECT commit, started_at, bool_and(status = 'ok') AS ok FROM ops_sim_runs
      WHERE tenant_id = ${tenantId} AND trigger = 'despliegue'
      GROUP BY commit, started_at::date, started_at ORDER BY started_at DESC LIMIT 1`)) as unknown as { commit: string | null; started_at: Date; ok: boolean }[];
    if (deploy) sections.pruebas.push(`Último despliegue con pruebas: ${deploy.commit ? deploy.commit.slice(0, 8) : 'sin commit'}, ${ago(new Date(deploy.started_at), t)}.`);
  });

  // Exámenes de prompts (22 nov 2026): un prompt cambiado sin examinar o que suspende su último examen pide atención.
  // Prompts globales de la plataforma: solo en el parte de la cuenta dueña.
  await safe('pruebas', async () => {
    if ((await defaultTenantId()) !== tenantId) return;
    const exams = await promptEvalOverview();
    const bad = exams.filter((e) => e.state === 'sin-examinar' || e.state === 'sin-examen' || e.state === 'suspendido' || e.state === 'error');
    attention += bad.length;
    const why = { 'sin-examinar': 'cambiado sin examinar', 'sin-examen': 'nunca examinado', suspendido: 'suspende su último examen', error: 'su último examen no terminó' } as Record<string, string>;
    for (const e of bad) sections.pruebas.push(`🟠 Prompt «${e.name}» (v${e.version}): ${why[e.state]}. Se pasa en IA → Prompts.`);
    if (exams.length && !bad.length) sections.pruebas.push(`Prompts con examen: ${exams.length}, todos aprobados en su versión actual.`);
  });

  await safe('errores', async () => {
    const rows = (await db.execute(sql`
      SELECT title, area, severity, status, occurrences, last_seen, diagnosis IS NOT NULL AS diagnosed
      FROM sys_error_groups
      WHERE (tenant_id = ${tenantId} OR tenant_id IS NULL) AND last_seen >= ${since24.toISOString()}::timestamp
      ORDER BY CASE severity WHEN 'critico' THEN 0 WHEN 'error' THEN 1 ELSE 2 END, last_seen DESC LIMIT 8`)) as unknown as {
      title: string;
      area: string;
      severity: string;
      status: string;
      occurrences: number;
      diagnosed: boolean;
    }[];
    const open = rows.filter((r) => r.status !== 'resuelto' && r.status !== 'ignorado');
    attention += open.filter((r) => r.severity === 'critico').length;
    if (!rows.length) return void sections.errores.push('Ningún error en las últimas 24 h.');
    sections.errores.push(`${open.length} abiertos con actividad en 24 h${rows.length > open.length ? `, ${rows.length - open.length} ya resueltos` : ''}.`);
    for (const r of open.slice(0, 5))
      sections.errores.push(`${r.severity === 'critico' ? '🔴' : r.severity === 'error' ? '🟠' : '⚪'} ${r.area ? `${r.area}: ` : ''}${r.title.slice(0, 140)} (${r.occurrences}×${r.diagnosed ? ', diagnosticado' : ''})`);
  });

  await safe('gasto', async () => {
    const ai = await getAiOverview(tenantId, now);
    const s = ai.settings;
    const over = ai.forecast > s.monthly;
    if (over || ai.todayUsd > s.daily) attention++;
    sections.gasto.push(`Hoy ${usd(ai.todayUsd)} (tope ${usd(s.daily)}). Mes ${usd(ai.mtd)}; previsión ${usd(ai.forecast)} de ${usd(s.monthly)}${over ? ' ⚠️' : ''}.`);
    if (ai.spikes.length) sections.gasto.push(`Picos hoy: ${ai.spikes.slice(0, 3).map((x) => x.fn).join(', ')}.`);
  });

  await safe('servidor', async () => {
    const o = await getInfraOverview(tenantId, { cachedOnly: true });
    if (!o.connected) return void sections.servidor.push('DigitalOcean sin conectar (Sistema → Servidor y costes).');
    const c = o.data?.capacity;
    if (c) sections.servidor.push(`Memoria ${c.memUsedPctP95_24h ?? c.memUsedPctNow ?? '?'} % (p95 24 h), disco ${c.diskUsedPct ?? '?'} %, carga ${c.loadP95PerCpu ?? '?'} por CPU.`);
    if (o.data) sections.servidor.push(`Coste del mes ${usd(o.data.mtdUsd)}${o.forecast !== null ? `, previsión ${usd(o.forecast)}` : ''}.`);
    if (o.recommendations[0]) sections.servidor.push(`💡 ${o.recommendations[0].title}`);
    if (!o.data) sections.servidor.push('Sin datos recientes de DigitalOcean.');
  });

  return { attention, sections };
}

const TITLES: Record<SystemSection, string> = { salud: '🩺 Salud', pruebas: '🧪 Pruebas simuladas', errores: '🐞 Errores', gasto: '🤖 Gasto de IA', servidor: '🖥 Servidor' };

export function reportText(r: SystemReport, html: boolean): string {
  const b = (s: string) => (html ? `<b>${s}</b>` : s);
  const e = (s: string) => (html ? escapeHtml(s) : s);
  return SYSTEM_SECTIONS.filter((s) => r.sections[s].length)
    .map((s) => `${b(TITLES[s])}\n${r.sections[s].map((l) => `• ${e(l)}`).join('\n')}`)
    .join('\n\n');
}

/** Herramienta del jefe de Sistema. */
export const estadoSistemaTool: AgentTool = {
  name: 'estado_sistema',
  module: 'operaciones',
  title: 'Estado del sistema',
  description:
    'Cómo está la plataforma ahora: salud (comprobaciones e incidencias), pruebas simuladas (cuáles fallan y el último despliegue) y exámenes de prompts, errores de las últimas 24 h, gasto de IA frente al presupuesto y servidor (memoria, disco, coste). Opcional: «secciones» para pedir solo algunas.',
  risk: 'lectura',
  inputSchema: {
    type: 'object',
    properties: { secciones: { type: 'array', items: { type: 'string', enum: [...SYSTEM_SECTIONS] } } },
    additionalProperties: false
  },
  async run(ctx, input) {
    const only = (Array.isArray(input.secciones) ? input.secciones : []).filter((s): s is SystemSection => (SYSTEM_SECTIONS as readonly string[]).includes(String(s)));
    const r = await buildSystemReport(ctx.tenantId, new Date(), only);
    return { ok: true, content: `${r.attention ? `${r.attention} cosas piden atención.` : 'Nada urgente.'}\n\n${reportText(r, false)}` };
  }
};

/** Planificador: el parte de Sistema una vez al día, a la hora del panel (zona horaria del dueño), sin sonido. */
export async function runSystemDigest(tenantId: string, now = new Date()): Promise<void> {
  const auto = await getAuto(tenantId, 'system_digest');
  if (!auto.enabled) return;
  const lp = localParts(await getOwnerTimezone(tenantId), now);
  const slot = String(auto.cfg.time ?? '09:00').trim();
  if (!/^\d{1,2}:\d{2}$/.test(slot)) return;
  if (lp.minutes < toMinutes(slot) || lp.minutes >= toMinutes(slot) + num(auto, 'windowMin')) return;
  const key = `sysdigest:${lp.date}`;
  const [exists] = await db.select({ id: opsNotifications.id }).from(opsNotifications).where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.dedupeKey, key))).limit(1);
  if (exists) return;
  await queueSystemDigest(tenantId, key, now);
}

export async function queueSystemDigest(tenantId: string, key: string, now = new Date()): Promise<boolean> {
  const owner = await getOwnerMember(tenantId);
  const r = await buildSystemReport(tenantId, now);
  const head = r.attention ? `⚙️ <b>Parte de Sistema</b> · ${r.attention} ${r.attention === 1 ? 'cosa pide' : 'cosas piden'} atención` : '⚙️ <b>Parte de Sistema</b> · todo en orden';
  return enqueueNotification({
    tenantId,
    kind: 'health',
    dedupeKey: key,
    forClickupUserId: owner?.clickupUserId ?? null,
    forName: owner?.username ?? 'Dueño',
    payload: { text: `${head}\n\n${reportText(r, true)}\n\nPregúntame por cualquier punto.`, toOwner: true, bot: SYSTEM_BOT, silent: true }
  });
}

/** Para Sistema → Pruebas y las pruebas: último parte enviado. */
export async function lastSystemDigestAt(tenantId: string): Promise<Date | null> {
  const [r] = await db
    .select({ at: opsNotifications.createdAt })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), sql`${opsNotifications.dedupeKey} LIKE 'sysdigest:%'`))
    .orderBy(desc(opsNotifications.createdAt))
    .limit(1);
  return r?.at ?? null;
}
