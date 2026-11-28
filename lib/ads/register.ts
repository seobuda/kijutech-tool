import 'server-only';

// Módulo Google Ads: alta en el núcleo al arrancar (lo llama wireApp() en la web y en el trabajador).
//  - Tipos de trabajo de la cola (ads.descubrir, ads.estructura, ads.sincronizar, ads.cambios, ads.latido, ads.historico)
//    y sus procesos periódicos (scopeType «cuenta»; scopeId = id de ads_accounts, «» para la MCC).
//  - Tarea del planificador «google ads»: una vez por hora da de alta o apaga los procesos según las cuentas seguidas, y a
//    las 06:30 de Madrid encola la descarga de métricas de todas (job_schedules deriva la hora; el parte de la mañana del
//    paso 2 depende de esta).
//  - Comprobación de Salud del sistema (MED-00).
// Todo es lectura de Google Ads.
import { registerHealthCheck, registerScheduled } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind, registerProcess } from '@/lib/core/jobs';
import { adsHealth } from '@/lib/ads/health';
import { ADS_ALERTS_TASK, runAdsAlerts } from '@/lib/ads/alerts';
import { evaluateAccount, evaluateAgency } from '@/lib/ads/findings';
import { checkLandings } from '@/lib/ads/landing';
import { runAudit } from '@/lib/ads/audit';
import { patchSettingsState } from '@/lib/ads/findings-store';
import { getSettingsRow } from '@/lib/ads/store';
import { zonedParts } from '@/lib/ads/rules';
import { ACCOUNT_PROCESSES, ADS_JOB, discoverAccounts, enqueueAccountSyncs, syncChanges, syncHistoryChunk, syncHourly, syncMetrics, syncSchedules, syncStructure } from '@/lib/ads/sync';

const accountOf = (payload: Record<string, unknown>) => String(payload.accountId ?? '');
const summary = (r: unknown) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : { r });

export const ADS_SCHEDULED_TASK = 'google ads';

const G = globalThis as unknown as { __kijuAdsHour?: Map<string, number>; __kijuAdsWired?: boolean };

let done = false;
export function registerAdsCapabilities(): void {
  if (done) return;
  done = true;

  registerJobKind({ kind: ADS_JOB.descubrir, timeoutS: 180, maxConcurrent: 1, maxAttempts: 2, run: async (ctx) => summary(await discoverAccounts(ctx.tenantId, { signal: ctx.signal, heartbeat: ctx.heartbeat })) });
  registerJobKind({ kind: ADS_JOB.estructura, timeoutS: 300, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, p) => summary(await syncStructure(ctx.tenantId, accountOf(p), { signal: ctx.signal, heartbeat: ctx.heartbeat })) });
  // Paso 2: al terminar métricas, latido o páginas, se evalúan las reglas de esa cuenta (también si la descarga falló:
  // así el hallazgo 15 y los «no comprobado» salen a tiempo). Una sola evaluación abierta por cuenta (dedupeKey).
  const thenEvaluate = async <T,>(tenantId: string, accountId: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } finally {
      await enqueueJob({ tenantId, kind: ADS_JOB.evaluar, payload: { accountId }, scopeType: 'cuenta', scopeId: accountId, priority: 5, dedupeKey: `${ADS_JOB.evaluar}:${accountId}` }).catch(() => undefined);
    }
  };
  registerJobKind({ kind: ADS_JOB.sincronizar, timeoutS: 300, maxConcurrent: 2, maxAttempts: 3, run: async (ctx, p) => summary(await thenEvaluate(ctx.tenantId, accountOf(p), () => syncMetrics(ctx.tenantId, accountOf(p), { signal: ctx.signal, heartbeat: ctx.heartbeat }))) });
  registerJobKind({ kind: ADS_JOB.cambios, timeoutS: 300, maxConcurrent: 2, maxAttempts: 3, run: async (ctx, p) => summary(await syncChanges(ctx.tenantId, accountOf(p), { signal: ctx.signal, heartbeat: ctx.heartbeat })) });
  registerJobKind({ kind: ADS_JOB.latido, timeoutS: 120, maxConcurrent: 3, maxAttempts: 2, run: async (ctx, p) => summary(await thenEvaluate(ctx.tenantId, accountOf(p), () => syncHourly(ctx.tenantId, accountOf(p), { signal: ctx.signal, heartbeat: ctx.heartbeat }))) });
  registerJobKind({ kind: ADS_JOB.landing, timeoutS: 300, maxConcurrent: 2, maxAttempts: 1, run: async (ctx, p) => summary(await thenEvaluate(ctx.tenantId, accountOf(p), () => checkLandings(ctx.tenantId, accountOf(p)))) });
  // Paso 3: auditoría de higiene (la primera vez crea la de entrada; después, vigilancia diaria). `fresh` = «Repetir». Un solo intento y de uno en uno: un reintento de «Repetir» no debe crear otra auditoría.
  registerJobKind({ kind: ADS_JOB.auditar, timeoutS: 300, maxConcurrent: 1, maxAttempts: 1, run: async (ctx, p) => summary(await runAudit(ctx.tenantId, accountOf(p), { fresh: p.fresh === true, userId: typeof p.userId === 'number' ? p.userId : null, signal: ctx.signal })) });
  registerJobKind({ kind: ADS_JOB.evaluar, timeoutS: 180, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, p) => summary(await evaluateAccount(ctx.tenantId, accountOf(p), { mode: p.mode === 'todas' ? 'todas' : 'auto' })) });
  // Histórico: tramos de 90 días mientras quede tiempo; si no termina, se encola la continuación.
  registerJobKind({
    kind: ADS_JOB.historico,
    timeoutS: 600,
    maxConcurrent: 1,
    maxAttempts: 3,
    run: async (ctx, p) => {
      const accountId = accountOf(p);
      const started = Date.now();
      let last: Record<string, unknown> = {};
      while (Date.now() - started < 240_000 && !ctx.signal.aborted) {
        last = summary(await syncHistoryChunk(ctx.tenantId, accountId, { signal: ctx.signal, heartbeat: ctx.heartbeat }));
        await ctx.heartbeat();
        if (last.done || last.skipped) break;
      }
      // Paso 3: con el histórico completo, la auditoría de entrada ya tiene su línea base de 90 días.
      if (last.done) await enqueueJob({ tenantId: ctx.tenantId, kind: ADS_JOB.auditar, payload: { accountId }, scopeType: 'cuenta', scopeId: accountId, priority: 7, dedupeKey: `${ADS_JOB.auditar}:${accountId}:historico` }).catch(() => undefined);
      if (!last.done && !last.skipped) {
        await enqueueJob({ tenantId: ctx.tenantId, kind: ADS_JOB.historico, payload: { accountId }, scopeType: 'cuenta', scopeId: accountId, priority: 8, dedupeKey: `${ADS_JOB.historico}:${accountId}:${String(last.chunks ?? '')}` });
      }
      return last;
    }
  });

  registerProcess({ key: ADS_JOB.descubrir, scopeType: 'cuenta', label: 'Google Ads: cuentas de la MCC y vínculo con la ficha', defaultEveryMinutes: 1440, enqueue: () => ({ kind: ADS_JOB.descubrir, priority: 6 }) });
  for (const proc of ACCOUNT_PROCESSES) {
    registerProcess({ key: proc.key, scopeType: 'cuenta', label: proc.label, defaultEveryMinutes: proc.every, enqueue: (_t, scopeId) => ({ kind: proc.key, payload: { accountId: scopeId }, priority: proc.key === ADS_JOB.latido ? 4 : 6 }) });
  }

  registerScheduled(ADS_SCHEDULED_TASK, async (tenantId) => {
    // Una vez por hora y cuenta de la herramienta: procesos al día con las cuentas seguidas (sin red ni coste).
    const hour = Math.floor(Date.now() / 3_600_000);
    const seen = (G.__kijuAdsHour ??= new Map());
    const settings = await getSettingsRow(tenantId);
    if (!settings) return;
    if (seen.get(tenantId) !== hour) {
      seen.set(tenantId, hour);
      await syncSchedules(tenantId);
      // Paso 2: la MCC entera (hallazgo 15 de ámbito agencia), una vez por hora.
      await evaluateAgency(tenantId);
    }
    if (!settings.syncEnabled || settings.authMode === 'none') return;
    // Descarga de las 06:30 de Madrid (con comprobación de reloj, una vez al día).
    const madrid = zonedParts(new Date(), 'Europe/Madrid');
    if ((madrid.hour > 6 || (madrid.hour === 6 && madrid.minute >= 30)) && settings.state?.lastMorningSync !== madrid.date) {
      await patchSettingsState(tenantId, { lastMorningSync: madrid.date });
      await enqueueAccountSyncs(tenantId, [ADS_JOB.sincronizar, ADS_JOB.cambios], `manana:${madrid.date}`);
    }
  });

  // Paso 2: avisos (modo sombra por defecto: sin encender en Ajustes no sale nada). Cada 30 s, solo el líder.
  registerScheduled(ADS_ALERTS_TASK, async (tenantId) => {
    await runAdsAlerts(tenantId);
  });

  registerHealthCheck('ads', adsHealth);
}
