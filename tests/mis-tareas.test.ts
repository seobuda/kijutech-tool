import { describe, expect, it } from 'vitest';
import { bucketTasks, toWorkTask, type WorkTask } from '@/lib/operaciones/my-tasks';
import { todayRange, type OpsTask } from '@/lib/operaciones/clickup';

// Mis tareas: el reparto por fechas y la unión con el encargo de la herramienta. Es la capa que se quedará cuando la
// herramienta sustituya a ClickUp, así que su lógica no debe depender de los tipos de ClickUp más allá de toWorkTask.
const NOW = new Date('2026-11-20T10:00:00Z');
const { start, end } = todayRange(NOW);
const DAY = 86_400_000;

function task(id: string, dueMs: number | null): WorkTask {
  return { id, title: id, dueMs, clientName: null, listName: null, externalStatus: null, externalUrl: null, requestId: null, workStatus: null };
}

describe('Mis tareas: reparto por fechas', () => {
  it('separa vencidas, hoy, próximos 7 días y más adelante, y descarta las que no tienen fecha', () => {
    const b = bucketTasks(
      [task('ayer', start - 1), task('hoy', start + 3600_000), task('mañana', end + 1000), task('dia7', end + 6 * DAY + 1000), task('dia8', end + 7 * DAY + 1000), task('sin', null)],
      NOW
    );
    expect(b.overdue.map((t) => t.id)).toEqual(['ayer']);
    expect(b.today.map((t) => t.id)).toEqual(['hoy']);
    expect(b.week.map((t) => t.id)).toEqual(['mañana', 'dia7']);
    expect(b.later.map((t) => t.id)).toEqual(['dia8']);
  });

  it('ordena cada grupo por fecha', () => {
    const b = bucketTasks([task('b', start - 1000), task('a', start - 5 * DAY)], NOW);
    expect(b.overdue.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('Mis tareas: unión con el encargo', () => {
  const cu: OpsTask = { id: 't1', name: 'Revisar fichas', url: 'https://app.clickup.com/t/t1', dueDate: start, status: 'to do', listName: 'SEO', listId: 'l1', assigneeIds: [7] };

  it('sin encargo, la tarea no tiene estado de trabajo', () => {
    const w = toWorkTask(cu, undefined);
    expect(w).toMatchObject({ id: 't1', title: 'Revisar fichas', dueMs: start, listName: 'SEO', externalUrl: cu.url, requestId: null, workStatus: null });
  });

  it('con encargo, lleva su estado (p. ej. devuelto) y su cliente', () => {
    const w = toWorkTask(cu, { id: 'r1', workStatus: 'devuelto', clientName: 'RF Serveis' });
    expect(w).toMatchObject({ requestId: 'r1', workStatus: 'devuelto', clientName: 'RF Serveis' });
  });
});
