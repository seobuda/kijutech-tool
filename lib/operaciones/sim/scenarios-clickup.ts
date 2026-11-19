import 'server-only';
// ClickUp DE VERDAD (fase 2 de las pruebas simuladas, 19 nov 2026). Es el único escenario que sale a internet: comprueba
// que el cliente de ClickUp (lib/operaciones/clickup.ts) y el mapa de estados de la cuenta real siguen funcionando con
// la API real, en la lista «Pruebas Kiju» (la única donde van las tareas de prueba, CLAUDE.md).
//
// Para que no le llegue nada a nadie:
//   - una sola tarea, sin responsable, que se reutiliza en cada ejecución (la busca por su marca; no se acumulan);
//   - la marca «[kiju:…]» en la descripción hace que la vigilancia de ClickUp la ignore (watch.ts);
//   - el comentario va con notify_all = false y quien actúa es el dueño del token (ClickUp no avisa de lo propio).
// Por salir fuera, NO entra en «Ejecutar todas» ni en las pruebas del despliegue (si ClickUp cae, no debe impedir un
// despliegue): se lanza a mano desde Sistema → Pruebas o con scripts/run-scenarios.sh clickup-real.
import { addTaskComment, createTask, findTaskByMarker, getListStatuses, getTaskContext, updateTaskStatus } from '@/lib/operaciones/clickup';
import { normText } from '@/lib/operaciones/clients';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { getStatusMapFor } from '@/lib/operaciones/status-map';
import { getStructure } from '@/lib/operaciones/structure';
import { check, type Scenario } from '@/lib/operaciones/sim/kit';

export const CLICKUP_TEST_LIST = 'Pruebas Kiju';
const MARKER = '[kiju:prueba-automatica-clickup]';

export const CLICKUP_SCENARIOS: Scenario[] = [
  {
    key: 'clickup-real',
    title: 'ClickUp de verdad en «Pruebas Kiju»',
    area: 'Integraciones',
    description: `Con el ClickUp real de la cuenta: busca la lista «${CLICKUP_TEST_LIST}», comprueba que sus estados de «en curso» y «listo» existen, y con una tarea de prueba sin responsable (siempre la misma) cambia el estado, comenta y la vuelve a cerrar. Sale a internet: se lanza aparte, no en «Ejecutar todas» ni al desplegar.`,
    external: true,
    async run(ctx) {
      const conn = await getClickUpToken(ctx.ownerTenantId);
      check(ctx, 'La cuenta tiene ClickUp conectado', Boolean(conn));
      const structure = await getStructure(ctx.ownerTenantId);
      const list = structure.spaces.flatMap((s) => s.lists).find((l) => normText(l.name) === normText(CLICKUP_TEST_LIST));
      check(ctx, `Existe la lista «${CLICKUP_TEST_LIST}» (en un espacio seleccionado)`, Boolean(list), 'Créala en ClickUp y pulsa «Actualizar desde ClickUp» en Ajustes');
      const token = conn!.token;

      const statuses = await getListStatuses(token, list!.id);
      check(ctx, 'ClickUp devuelve los estados de la lista', statuses.length > 0, `${statuses.length} estados`);
      const map = await getStatusMapFor(ctx.ownerTenantId, list!.id);
      const names = statuses.map((s) => s.status.toLowerCase());
      const inProgress = map.inProgress ?? statuses.find((s) => s.type === 'custom')?.status ?? null;
      const done = map.done ?? statuses.find((s) => s.type === 'closed' || s.type === 'done')?.status ?? null;
      check(ctx, 'El estado «en curso» del mapa existe en ClickUp', Boolean(inProgress && names.includes(inProgress.toLowerCase())), `mapa: ${map.inProgress ?? '—'} · ClickUp: ${names.join(', ')}`);
      check(ctx, 'El estado «listo» del mapa existe en ClickUp', Boolean(done && names.includes(done.toLowerCase())), `mapa: ${map.done ?? '—'} · ClickUp: ${names.join(', ')}`);

      let task = await findTaskByMarker(token, list!.id, MARKER);
      const reused = Boolean(task);
      if (!task) {
        task = await createTask(token, list!.id, {
          name: '[PRUEBA automática] Comprobación de ClickUp',
          description: `Tarea de las pruebas simuladas de Kiju (Sistema → Pruebas). Se reutiliza en cada ejecución; no hace falta hacer nada con ella.\n\n${MARKER}`
        });
      }
      check(ctx, reused ? 'Encuentra la tarea de prueba (reutilizada)' : 'Crea la tarea de prueba', Boolean(task?.id), task?.url);

      await updateTaskStatus(token, task!.id, inProgress!);
      const stamp = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
      const comment = `Prueba automática de Kiju · ${stamp}`;
      await addTaskComment(token, task!.id, comment);
      const mid = await getTaskContext(token, task!.id);
      check(ctx, `Pasa a «${inProgress}»`, mid.status.toLowerCase() === inProgress!.toLowerCase(), `estado: ${mid.status}`);
      check(ctx, 'El comentario queda en la tarea', mid.comments.some((c) => c.text.includes(comment)), `${mid.comments.length} comentarios`);

      await updateTaskStatus(token, task!.id, done!);
      const end = await getTaskContext(token, task!.id);
      check(ctx, `Vuelve a cerrarse en «${done}»`, end.status.toLowerCase() === done!.toLowerCase(), `estado: ${end.status}`);
    }
  }
];
