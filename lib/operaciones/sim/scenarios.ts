import 'server-only';
// Escenarios de pruebas simuladas (19 nov 2026). Cada uno es un caso real de punta a punta en el entorno de pruebas:
// crea un encargo, la persona simulada recibe el aviso, pulsa botones o escribe, y se comprueba lo que pasa en la base
// de datos, en la bandeja hacia ClickUp y en la conversación. Usan el código real del bot y del flujo de trabajo.
// Para añadir uno: un objeto más en SCENARIOS (clave estable: es la que guarda el historial de ejecuciones). Las ayudas
// están en kit.ts; jornada y tiempos en scenarios-jornada.ts; ClickUp de verdad en scenarios-clickup.ts.
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsRequestEvents, opsRequests, opsTelegramPending } from '@/lib/db/schema';
import { SIM_STATUSES } from '@/lib/operaciones/sim/env';
import { simPressStale } from '@/lib/operaciones/sim/actor';
import { botMsgs, check, flush, labels, lastBot, lastToast, newRequest, outbox, press, reload, say, statusesSent, type Scenario } from '@/lib/operaciones/sim/kit';
import { JORNADA_SCENARIOS } from '@/lib/operaciones/sim/scenarios-jornada';
import { CLICKUP_SCENARIOS } from '@/lib/operaciones/sim/scenarios-clickup';
import { PANTALLAS_SCENARIOS } from '@/lib/operaciones/sim/scenarios-pantallas';

export { StepFailed, createSimRequest, type Scenario, type ScenarioCtx, type SimStep } from '@/lib/operaciones/sim/kit';

// --- Escenarios ----------------------------------------------------------------------------------------------------

const BASE_SCENARIOS: Scenario[] = [
  {
    key: 'aviso-encargo',
    title: 'Llega un encargo nuevo',
    area: 'Avisos',
    description: 'Al crear un encargo, la persona responsable recibe el aviso con su título, el enlace y solo los botones de empezar («Empezar ahora» y «Más tarde»); a quien lleva las operaciones no le llega nada.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Revisar la ficha de Google del cliente');
      const msg = await lastBot(ctx, ctx.emp, req.title);
      check(ctx, 'El empleado recibe el aviso con el título', Boolean(msg));
      for (const b of ['Empezar ahora', 'Más tarde']) check(ctx, `El aviso trae «${b}»`, labels(msg).some((t) => t.includes(b)), labels(msg).join(' · '));
      check(ctx, 'Sin empezar, no ofrece «Hecho» ni «Bloqueado»', !labels(msg).some((t) => t.includes('Hecho') || t.includes('Bloqueado')), labels(msg).join(' · '));
      check(ctx, 'El enlace a la tarea va en el aviso', Boolean(msg?.text.includes(req.clickupTaskUrl!)));
      check(ctx, 'A quien lleva las operaciones no le llega nada', (await botMsgs(ctx, ctx.own)).length === 0);
    }
  },
  {
    key: 'botones-estado',
    title: 'Los botones del aviso cambian con el estado',
    area: 'Avisos',
    description: 'Al empezar, el mismo aviso se actualiza: deja de ofrecer «Empezar» y pasa a «Bloqueado», «Hecho» y «Hecho, ¿lo revisas?», con la línea «En curso». Queda registrado quién lo vio.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Actualizar el horario en la web');
      const notice = await lastBot(ctx, ctx.emp, req.title);
      await press(ctx, notice, 'Empezar ahora');
      const after = await lastBot(ctx, ctx.emp, req.title);
      check(ctx, 'Es el mismo mensaje, actualizado (no uno nuevo)', after?.id === notice?.id && Boolean(after?.editedAt), `antes ${notice?.id}, después ${after?.id}`);
      for (const b of ['Bloqueado', 'Hecho', 'lo revisas']) check(ctx, `Ahora ofrece «${b}»`, labels(after).some((t) => t.includes(b)), labels(after).join(' · '));
      check(ctx, 'Ya no ofrece «Empezar ahora»', !labels(after).some((t) => t.includes('Empezar')), labels(after).join(' · '));
      check(ctx, 'El aviso muestra «En curso»', Boolean(after?.text.includes('En curso')));
      const r = await reload(ctx, req.id);
      check(ctx, 'Queda guardado quién lo vio', Boolean(r?.seenAt) && Boolean(r?.seenBy), `seenBy: ${r?.seenBy ?? '—'}`);
    }
  },
  {
    key: 'empezar-hecho',
    title: 'Empezar y Hecho cambian el estado en ClickUp',
    area: 'Flujo de trabajo',
    description: '«Empezar ahora» pasa la tarea a «en curso» y «Hecho» la completa al momento: en ClickUp, a «listo». El comentario es opcional.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Publicar el artículo del blog');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Empezar ahora');
      check(ctx, 'Responde «En curso»', (await lastToast(ctx, ctx.emp)).includes('En curso'));
      check(ctx, 'El encargo pasa a «en curso»', (await reload(ctx, req.id))?.workStatus === 'en_curso');
      check(ctx, `ClickUp recibe «${SIM_STATUSES.inProgress}»`, (await statusesSent(ctx, req.id)).includes(SIM_STATUSES.inProgress), (await statusesSent(ctx, req.id)).join(', '));
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Hecho');
      check(ctx, 'El encargo queda completado al pulsar Hecho', (await reload(ctx, req.id))?.workStatus === 'completado', (await reload(ctx, req.id))?.workStatus);
      check(ctx, `ClickUp recibe «${SIM_STATUSES.done}»`, (await statusesSent(ctx, req.id)).includes(SIM_STATUSES.done), (await statusesSent(ctx, req.id)).join(', '));
      const ask = await lastBot(ctx, ctx.emp, '¿Quieres añadir un enlace');
      check(ctx, 'Pregunta si quiere añadir un comentario (opcional)', Boolean(ask));
      await press(ctx, ask, 'Sin comentario');
      check(ctx, 'La pregunta del comentario se cierra', labels(await lastBot(ctx, ctx.emp, '¿Quieres añadir un enlace')).length === 0);
      const pend = await db.select().from(opsTelegramPending).where(eq(opsTelegramPending.chatId, ctx.emp));
      check(ctx, 'No queda ninguna pregunta pendiente', pend.filter((p) => p.tenantId === ctx.simTenantId).length === 0);
    }
  },
  {
    key: 'hecho-comentario',
    title: 'Hecho con un enlace como comentario',
    area: 'Flujo de trabajo',
    description: 'Tras «Hecho», si la persona escribe un enlace, se guarda en el encargo y va como comentario a la tarea de ClickUp.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Subir las fotos nuevas a la galería');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Empezar ahora');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Hecho');
      const url = 'https://ejemplo.com/galeria-nueva';
      await say(ctx, ctx.emp, url);
      const r = await reload(ctx, req.id);
      check(ctx, 'El enlace queda en el encargo', Boolean(r?.doneNote?.includes(url)), r?.doneNote ?? '—');
      const comments = (await outbox(ctx, req.id)).filter((o) => o.action === 'comment').map((o) => (o.payload as { text: string }).text);
      check(ctx, 'Va como comentario a ClickUp', comments.some((c) => c.includes(url)), comments.join(' | ') || 'sin comentarios');
    }
  },
  {
    key: 'mas-tarde',
    title: '«Más tarde» deja el encargo pendiente con recordatorio',
    area: 'Flujo de trabajo',
    description: '«Más tarde» responde que se recordará, queda registrado y el encargo sigue asignado (no empieza).',
    async run(ctx) {
      const req = await newRequest(ctx, 'Responder a la reseña de Google');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Más tarde');
      check(ctx, 'Responde «Te lo recordaré»', (await lastToast(ctx, ctx.emp)).includes('recordaré'));
      check(ctx, 'El encargo sigue asignado', (await reload(ctx, req.id))?.workStatus === 'asignado');
      const ev = await db.select().from(opsRequestEvents).where(and(eq(opsRequestEvents.tenantId, ctx.simTenantId), eq(opsRequestEvents.requestId, req.id)));
      check(ctx, 'Queda registrado el «Más tarde»', ev.some((e) => e.eventType === 'later'), ev.map((e) => e.eventType).join(', '));
    }
  },
  {
    key: 'hecho-dos-veces',
    title: 'Pulsar «Hecho» dos veces no duplica nada',
    area: 'Robustez',
    description: 'Una segunda pulsación de «Hecho» en el mismo aviso contesta que ya está entregado y no manda otro cambio a ClickUp.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Cambiar el banner de la home');
      const notice = await lastBot(ctx, ctx.emp, req.title);
      await press(ctx, notice, 'Empezar ahora');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Hecho');
      const first = (await statusesSent(ctx, req.id)).filter((s) => s === SIM_STATUSES.done).length;
      // Como si la persona volviera a pulsar «Hecho» antes de que se le actualizara el aviso (doble toque o móvil lento):
      // se reenvía la misma pulsación.
      await simPressStale(ctx.simTenantId, notice!.id, `dn:${req.id}`, '✅ Hecho');
      await flush(ctx);
      await flush(ctx);
      check(ctx, 'La segunda vez responde que ya está entregado', (await lastToast(ctx, ctx.emp)).includes('ya está entregado'), await lastToast(ctx, ctx.emp));
      const second = (await statusesSent(ctx, req.id)).filter((s) => s === SIM_STATUSES.done).length;
      check(ctx, 'Solo un «listo» hacia ClickUp', first === 1 && second === 1, `primero ${first}, después ${second}`);
    }
  },
  {
    key: 'revision-aceptar',
    title: 'Revisión urgente aceptada',
    area: 'Revisión',
    description: 'En un encargo urgente, «Hecho, ¿lo revisas?» avisa al momento a quien lleva las operaciones; al aceptar, se completa y la persona recibe el aprobado.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Enviar el informe mensual al cliente', 1);
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Empezar ahora');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'lo revisas');
      check(ctx, 'El encargo pasa a revisión', (await reload(ctx, req.id))?.workStatus === 'en_revision');
      check(ctx, `ClickUp recibe «${SIM_STATUSES.inReview}»`, (await statusesSent(ctx, req.id)).includes(SIM_STATUSES.inReview));
      await press(ctx, await lastBot(ctx, ctx.emp, '¿Quieres añadir un enlace'), 'Sin comentario');
      const review = await lastBot(ctx, ctx.own, req.title);
      check(ctx, 'Quien lleva las operaciones recibe la revisión al momento', Boolean(review));
      await press(ctx, review, 'Aceptar');
      check(ctx, 'El encargo queda completado', (await reload(ctx, req.id))?.workStatus === 'completado');
      check(ctx, `ClickUp recibe «${SIM_STATUSES.done}»`, (await statusesSent(ctx, req.id)).includes(SIM_STATUSES.done));
      check(ctx, 'La persona recibe el aprobado', Boolean(await lastBot(ctx, ctx.emp, 'Aprobado')));
    }
  },
  {
    key: 'revision-devolver',
    title: 'Revisión devuelta con motivo',
    area: 'Revisión',
    description: 'Al devolver, el bot pide el motivo, el encargo vuelve a la persona con ese motivo y en ClickUp vuelve a «en curso».',
    async run(ctx) {
      const req = await newRequest(ctx, 'Redactar la página de servicios', 1);
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Empezar ahora');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'lo revisas');
      await press(ctx, await lastBot(ctx, ctx.emp, '¿Quieres añadir un enlace'), 'Sin comentario');
      await press(ctx, await lastBot(ctx, ctx.own, req.title), 'Devolver');
      check(ctx, 'El bot pide el motivo', Boolean(await lastBot(ctx, ctx.own, 'motivo')));
      await say(ctx, ctx.own, 'Falta el enlace a la página publicada');
      check(ctx, 'El encargo queda devuelto', (await reload(ctx, req.id))?.workStatus === 'devuelto', (await reload(ctx, req.id))?.workStatus);
      check(ctx, 'La persona recibe la devolución con el motivo', Boolean(await lastBot(ctx, ctx.emp, 'Falta el enlace')));
      check(ctx, `ClickUp vuelve a «${SIM_STATUSES.inProgress}»`, (await statusesSent(ctx, req.id)).at(-1) === SIM_STATUSES.inProgress, (await statusesSent(ctx, req.id)).join(', '));
    }
  },
  {
    key: 'bloqueado-cancelar',
    title: '«Bloqueado» y luego /cancelar',
    area: 'Robustez',
    description: 'Con la tarea en curso, al pulsar «Bloqueado» el bot pregunta qué necesita; con /cancelar no queda nada pendiente y el encargo sigue en curso.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Preparar la propuesta de palabras clave');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Empezar ahora');
      await press(ctx, await lastBot(ctx, ctx.emp, req.title), 'Bloqueado');
      check(ctx, 'El bot pregunta qué necesita', Boolean(await lastBot(ctx, ctx.emp, '¿Qué necesitas?')));
      await say(ctx, ctx.emp, '/cancelar');
      const pend = (await db.select().from(opsTelegramPending).where(eq(opsTelegramPending.chatId, ctx.emp))).filter((p) => p.tenantId === ctx.simTenantId);
      check(ctx, 'No queda la pregunta pendiente', pend.length === 0);
      check(ctx, 'El encargo sigue en curso', (await reload(ctx, req.id))?.workStatus === 'en_curso', (await reload(ctx, req.id))?.workStatus);
    }
  },
  {
    key: 'encargo-borrado',
    title: 'Botón de un encargo que ya no existe',
    area: 'Robustez',
    description: 'Si el encargo se borró, pulsar un botón de su aviso viejo contesta con un mensaje claro y no rompe nada.',
    async run(ctx) {
      const req = await newRequest(ctx, 'Encargo que se borrará');
      const notice = await lastBot(ctx, ctx.emp, req.title);
      await db.delete(opsRequests).where(and(eq(opsRequests.tenantId, ctx.simTenantId), eq(opsRequests.id, req.id)));
      await press(ctx, notice, 'Empezar ahora');
      const toast = await lastToast(ctx, ctx.emp);
      check(ctx, 'Contesta que el encargo no existe', /no encontrado|ya no existe/i.test(toast), toast || 'sin respuesta');
    }
  }
];

export const SCENARIOS: Scenario[] = [...BASE_SCENARIOS, ...JORNADA_SCENARIOS, ...PANTALLAS_SCENARIOS, ...CLICKUP_SCENARIOS];

export const scenarioByKey = (key: string) => SCENARIOS.find((s) => s.key === key);
