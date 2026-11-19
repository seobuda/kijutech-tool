import 'server-only';
// Escenarios de jornada y tiempos (fase 2 de las pruebas simuladas, 19 nov 2026), con RELOJ SIMULADO: el planificador de
// la jornada (runJornada) recibe la hora que se quiera, y para «ha pasado una hora» se mueven hacia atrás las horas
// guardadas de la cuenta de pruebas. Así se prueban los buenos días, los reintentos, el fin del descanso, el cierre
// automático y el tiempo de una tarea sin esperar de verdad.
//
// Jornada y tiempos están apagadas en la cuenta de pruebas: cada escenario las enciende (sin retener avisos ni mandar
// correos) y las apaga al terminar, pase lo que pase. Antes de empezar borra la jornada simulada de la cuenta de pruebas
// (registros, tiempos y avisos de jornada): nunca toca la cuenta real.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsAutomations, opsNotifications, opsTaskTimes, opsTeamProfiles, opsTelegramPending, opsWorkEvents } from '@/lib/db/schema';
import { invalidateAutomations } from '@/lib/operaciones/automations';
import { getPersonDay, scheduledBounds, todayIn } from '@/lib/operaciones/jornada';
import { runJornada } from '@/lib/operaciones/jornada-worker';
import { SIM_EMPLOYEE_ID, SIM_WORK_TYPE } from '@/lib/operaciones/sim/env';
import { botMsgs, check, flush, labels, lastBot, lastToast, newRequest, press, reload, say, type Scenario, type ScenarioCtx } from '@/lib/operaciones/sim/kit';

const TZ = 'Europe/Madrid';
const MIN = 60_000;
const SIM_AUTOS = ['jornada', 'tiempos'];

async function setAuto(simTenantId: string, key: string, config: Record<string, unknown>) {
  await db
    .insert(opsAutomations)
    .values({ tenantId: simTenantId, key, enabled: true, config })
    .onConflictDoUpdate({ target: [opsAutomations.tenantId, opsAutomations.key], set: { enabled: true, config, updatedAt: new Date() } });
}

/** Borra la jornada simulada (solo la cuenta de pruebas) para empezar cada escenario desde «sin empezar». */
async function resetJornada(ctx: ScenarioCtx) {
  const t = ctx.simTenantId;
  await db.delete(opsTaskTimes).where(eq(opsTaskTimes.tenantId, t));
  await db.delete(opsWorkEvents).where(eq(opsWorkEvents.tenantId, t));
  await db.delete(opsNotifications).where(and(eq(opsNotifications.tenantId, t), eq(opsNotifications.kind, 'jornada')));
  await db.delete(opsTelegramPending).where(and(eq(opsTelegramPending.tenantId, t), inArray(opsTelegramPending.chatId, [ctx.emp, ctx.own])));
}

/** Enciende jornada (y tiempos si se pide) en la cuenta de pruebas mientras corre `fn`; las apaga siempre al final. */
async function withJornada(ctx: ScenarioCtx, opts: { tiempos?: boolean; workStart?: string }, fn: () => Promise<void>) {
  const t = ctx.simTenantId;
  await resetJornada(ctx);
  await db.update(opsTeamProfiles).set({ workStart: opts.workStart ?? '00:00', hoursPerDay: '8', lunchStart: null, lunchEnd: null, quietStart: null, quietEnd: null }).where(and(eq(opsTeamProfiles.tenantId, t), eq(opsTeamProfiles.clickupUserId, SIM_EMPLOYEE_ID)));
  await setAuto(t, 'jornada', { holdNotices: false, emailPing: false, repingMin: 10, maxPings: 2, autoCloseMin: 30, breakQuotaMin: 20 });
  if (opts.tiempos) await setAuto(t, 'tiempos', { askEstimate: true, askJustify: true });
  invalidateAutomations(t);
  try {
    await fn();
  } finally {
    await db.delete(opsAutomations).where(and(eq(opsAutomations.tenantId, t), inArray(opsAutomations.key, SIM_AUTOS)));
    invalidateAutomations(t);
  }
}

const hhmm = (ms: number) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

/** Hora de entrada de la ficha para que «ahora» caiga 30 min después de empezar (sin pasar a ayer). */
function startNearNow(now: number): string {
  const back = now - 30 * MIN;
  return todayIn(TZ, new Date(back)) === todayIn(TZ, new Date(now)) ? hhmm(back) : '00:00';
}

async function events(ctx: ScenarioCtx) {
  return db.select().from(opsWorkEvents).where(and(eq(opsWorkEvents.tenantId, ctx.simTenantId), eq(opsWorkEvents.clickupUserId, SIM_EMPLOYEE_ID))).orderBy(opsWorkEvents.at);
}
const kinds = async (ctx: ScenarioCtx) => (await events(ctx)).map((e) => e.kind);
const status = async (ctx: ScenarioCtx) => (await getPersonDay(ctx.simTenantId, SIM_EMPLOYEE_ID))?.state.status ?? 'sin ficha';

/** El planificador de la jornada a la hora simulada `at`, y el envío de lo que encole. */
async function tick(ctx: ScenarioCtx, at: number) {
  await runJornada(ctx.simTenantId, new Date(at));
  await flush(ctx);
}

/** «Ha pasado el tiempo»: mueve hacia atrás todas las horas guardadas de la jornada, sus avisos y los tiempos simulados
 *  (todo de la cuenta de pruebas), de modo que la hora real de ahora sea `minutes` más tarde que lo ocurrido. */
async function rewind(ctx: ScenarioCtx, minutes: number) {
  const t = ctx.simTenantId;
  const notes = await db.select().from(opsNotifications).where(and(eq(opsNotifications.tenantId, t), eq(opsNotifications.kind, 'jornada')));
  for (const n of notes) {
    await db
      .update(opsNotifications)
      .set({ createdAt: new Date(n.createdAt.getTime() - minutes * MIN), sentAt: n.sentAt ? new Date(n.sentAt.getTime() - minutes * MIN) : null })
      .where(eq(opsNotifications.id, n.id));
  }
  for (const e of await events(ctx)) await db.update(opsWorkEvents).set({ at: new Date(e.at.getTime() - minutes * MIN) }).where(eq(opsWorkEvents.id, e.id));
  const rows = await db.select().from(opsTaskTimes).where(eq(opsTaskTimes.tenantId, t));
  for (const r of rows) await db.update(opsTaskTimes).set({ startedAt: new Date(r.startedAt.getTime() - minutes * MIN) }).where(eq(opsTaskTimes.id, r.id));
}

export const JORNADA_SCENARIOS: Scenario[] = [
  {
    key: 'jornada-comandos',
    title: 'Un día con los comandos de la jornada',
    area: 'Jornada',
    description: '/empiezo → «Otra cosa» → escribe con qué empieza (entrada), /descanso 10, /vuelvo y /termino. Cada paso queda registrado y la jornada termina cerrada.',
    async run(ctx) {
      await withJornada(ctx, {}, async () => {
        await say(ctx, ctx.emp, '/empiezo');
        const start = await lastBot(ctx, ctx.emp, '¿Empezamos');
        check(ctx, '/empiezo pregunta con qué empieza', Boolean(start), (await botMsgs(ctx, ctx.emp)).at(-1)?.text.slice(0, 120));
        check(ctx, 'Ofrece «Otra cosa» y «Hoy no trabajo»', labels(start).some((t) => t.includes('Otra cosa')) && labels(start).some((t) => t.includes('Hoy no trabajo')), labels(start).join(' · '));
        await press(ctx, start, 'Otra cosa');
        check(ctx, 'Pide que escriba la tarea', Boolean(await lastBot(ctx, ctx.emp, '¿Con qué empiezas?')));
        await say(ctx, ctx.emp, 'Revisar el correo de clientes');
        check(ctx, 'Responde con la entrada registrada', Boolean(await lastBot(ctx, ctx.emp, 'Entrada registrada')));
        const ent = (await events(ctx)).find((e) => e.kind === 'entrada');
        check(ctx, 'La entrada queda guardada con su tarea', (ent?.task as { name?: string } | null)?.name === 'Revisar el correo de clientes', JSON.stringify(ent?.task ?? null));
        check(ctx, 'Estado: trabajando', (await status(ctx)) === 'trabajando', await status(ctx));

        await say(ctx, ctx.emp, '/descanso 10');
        check(ctx, 'Descanso de 10 min registrado', (await events(ctx)).some((e) => e.kind === 'descanso' && e.plannedMinutes === 10), (await kinds(ctx)).join(', '));
        check(ctx, 'Estado: descanso', (await status(ctx)) === 'descanso', await status(ctx));
        await say(ctx, ctx.emp, '/vuelvo');
        check(ctx, 'Vuelta registrada', (await kinds(ctx)).includes('vuelta'), (await kinds(ctx)).join(', '));
        await say(ctx, ctx.emp, '/termino');
        check(ctx, 'Responde «Jornada terminada»', Boolean(await lastBot(ctx, ctx.emp, 'Jornada terminada')));
        check(ctx, 'Estado: terminado', (await status(ctx)) === 'terminado', await status(ctx));
        await say(ctx, ctx.emp, '/termino');
        check(ctx, 'Un segundo /termino no registra otra salida', (await kinds(ctx)).filter((k) => k === 'salida').length === 1, (await kinds(ctx)).join(', '));
      });
    }
  },
  {
    key: 'jornada-reloj',
    title: 'Buenos días, reintento, fin del descanso y cierre automático',
    area: 'Jornada',
    description: 'Con reloj simulado: a su hora llegan los buenos días; si no empieza, un reintento (y uno solo); tras un descanso de 5 min, «¿Has vuelto?»; al acabar el horario, «¿Terminas?», y pasado el margen, cierre automático marcado.',
    async run(ctx) {
      const now = Date.now();
      await withJornada(ctx, { workStart: startNearNow(now) }, async () => {
        await tick(ctx, now);
        const hello = await lastBot(ctx, ctx.emp, 'Buenos días');
        check(ctx, 'A su hora llegan los buenos días', Boolean(hello), (await botMsgs(ctx, ctx.emp)).at(-1)?.text.slice(0, 120) ?? 'ningún mensaje');
        check(ctx, 'Con los botones para empezar', labels(hello).some((t) => t.includes('Otra cosa')) && labels(hello).some((t) => t.includes('15 min')), labels(hello).join(' · '));
        await tick(ctx, now);
        check(ctx, 'Si el planificador vuelve a pasar, no repite los buenos días', (await botMsgs(ctx, ctx.emp)).filter((m) => m.text.includes('Buenos días')).length === 1);

        await rewind(ctx, 11); // «han pasado 11 minutos» desde los buenos días
        await tick(ctx, Date.now());
        check(ctx, 'A los 10 min sin empezar, un reintento', Boolean(await lastBot(ctx, ctx.emp, 'Aún no has marcado tu entrada')));
        await tick(ctx, Date.now() + MIN);
        check(ctx, 'Y no otro al minuto siguiente', (await botMsgs(ctx, ctx.emp)).filter((m) => m.text.includes('Aún no has marcado')).length === 1);

        await press(ctx, await lastBot(ctx, ctx.emp, 'Aún no has marcado'), 'Otra cosa');
        await say(ctx, ctx.emp, 'Preparar el informe semanal');
        check(ctx, 'Empieza: trabajando', (await status(ctx)) === 'trabajando', await status(ctx));
        await say(ctx, ctx.emp, '/descanso 5');
        await tick(ctx, Date.now() + 6 * MIN);
        const back = await lastBot(ctx, ctx.emp, 'Se acabó tu descanso');
        check(ctx, 'Pasados los 5 min: «¿Has vuelto?»', Boolean(back));
        await press(ctx, back, 'He vuelto');
        check(ctx, '«He vuelto» registra la vuelta', (await status(ctx)) === 'trabajando' && (await kinds(ctx)).includes('vuelta'), (await kinds(ctx)).join(', '));

        const day = (await getPersonDay(ctx.simTenantId, SIM_EMPLOYEE_ID))!;
        const { end } = scheduledBounds(day.sch, day.date);
        await tick(ctx, end + MIN);
        const endq = await lastBot(ctx, ctx.emp, '¿Terminas?');
        check(ctx, 'Al acabar el horario: «¿Terminas?»', Boolean(endq) && labels(endq).some((t) => t.includes('Termino')), labels(endq).join(' · '));
        await tick(ctx, end + 31 * MIN);
        const auto = (await events(ctx)).find((e) => e.kind === 'salida');
        check(ctx, 'Pasado el margen, cierre automático marcado', auto?.source === 'auto', auto ? `fuente: ${auto.source}` : 'sin salida');
      });
    }
  },
  {
    key: 'tiempos-tarea',
    title: 'Tiempo de una tarea: tipo, estimación y motivo si se pasa',
    area: 'Tiempos',
    description: '«Empezar» abre la jornada con la tarea y pregunta el tipo y la estimación; con el reloj adelantado 45 min (margen del tipo: 5-20), «Hecho» la cierra fuera de margen, pregunta qué pasó y guarda el motivo y la URL; y luego «¿Con qué sigues?».',
    async run(ctx) {
      await withJornada(ctx, { tiempos: true }, async () => {
        const req = await newRequest(ctx, 'Optimizar las imágenes de la web');
        const notice = await lastBot(ctx, ctx.emp, req.title);
        // El aviso se actualiza en el mismo mensaje; las preguntas de tiempos también llevan el título, así que se
        // vuelve a leer el aviso por su número.
        const noticeNow = async () => (await botMsgs(ctx, ctx.emp)).find((m) => m.id === notice?.id);
        await press(ctx, notice, 'Empezar ahora');
        check(ctx, '«Empezar» abre la jornada', (await status(ctx)) === 'trabajando', await status(ctx));
        const [row0] = await db.select().from(opsTaskTimes).where(and(eq(opsTaskTimes.tenantId, ctx.simTenantId), eq(opsTaskTimes.requestId, req.id)));
        check(ctx, 'Se abre el tiempo de la tarea', row0?.status === 'abierta');
        const typeQ = await lastBot(ctx, ctx.emp, '¿Qué tipo de tarea es?');
        check(ctx, 'Pregunta el tipo de tarea', Boolean(typeQ));
        await press(ctx, typeQ, SIM_WORK_TYPE.label);
        const estQ = await lastBot(ctx, ctx.emp, '¿Cuánto crees que te llevará?');
        check(ctx, 'Después, la estimación con opciones de un toque', labels(estQ).filter((t) => t.endsWith('min')).length >= 2, labels(estQ).join(' · '));
        const first = labels(estQ).find((t) => t.endsWith('min'))!;
        await press(ctx, estQ, first);
        const row1 = (await db.select().from(opsTaskTimes).where(eq(opsTaskTimes.id, row0.id)))[0];
        check(ctx, 'La estimación queda guardada', row1?.estimateMinutes === Number(first.replace(/\D/g, '')) && row1?.workTypeKey === SIM_WORK_TYPE.key, `${row1?.estimateMinutes} min · ${row1?.workTypeKey}`);

        await rewind(ctx, 45); // «han pasado 45 minutos»
        await press(ctx, await noticeNow(), 'Hecho');
        check(ctx, 'El encargo queda completado', (await reload(ctx, req.id))?.workStatus === 'completado');
        const row2 = (await db.select().from(opsTaskTimes).where(eq(opsTaskTimes.id, row0.id)))[0];
        check(ctx, 'El tiempo se cierra con unos 45 min', row2?.status === 'cerrada' && (row2.workedMinutes ?? 0) >= 40 && (row2.workedMinutes ?? 0) <= 50, `${row2?.status} · ${row2?.workedMinutes} min`);
        check(ctx, 'Fuera del margen del tipo', row2?.verdict === 'pasado' && row2.justifyStatus === 'pendiente', `${row2?.verdict} · ${row2?.justifyStatus}`);
        await press(ctx, await lastBot(ctx, ctx.emp, '¿Quieres añadir un enlace'), 'Sin comentario');
        const why = (await botMsgs(ctx, ctx.emp)).reverse().find((m) => labels(m).some((t) => t.includes('más grande')));
        check(ctx, 'Pregunta qué la complicó', Boolean(why), (await botMsgs(ctx, ctx.emp)).at(-1)?.text.slice(0, 120));
        await press(ctx, why, 'más grande');
        check(ctx, 'Pide la URL', Boolean(await lastBot(ctx, ctx.emp, 'URL')));
        await say(ctx, ctx.emp, 'https://ejemplo.com/imagenes-optimizadas');
        const row3 = (await db.select().from(opsTaskTimes).where(eq(opsTaskTimes.id, row0.id)))[0];
        check(ctx, 'Motivo y URL guardados', row3?.overReason === 'gr' && Boolean(row3.evidenceUrl?.includes('ejemplo.com')), `${row3?.overReason} · ${row3?.evidenceUrl} · ${row3?.justifyStatus}`);
        check(ctx, 'Y pregunta con qué sigue', Boolean(await lastBot(ctx, ctx.emp, '¿Con qué sigues?')));
        check(ctx, 'Sin errores en la última respuesta', !/no se pudo/i.test(await lastToast(ctx, ctx.emp)));
      });
    }
  }
];
