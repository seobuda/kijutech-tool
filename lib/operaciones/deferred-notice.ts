// Avisos de encargo solo para el día que toca (23 nov 2026). Lo detectó Jesús: le llegó al momento un encargo con fecha
// de otro día y se puso a hacerlo. Ahora un encargo para otro día no avisa al asignarse: su aviso (con los botones del
// flujo) queda programado para la hora de entrada de esa persona el día que toca, o el último día laborable antes de
// la fecha si ese día no trabaja. Los de hoy, sin fecha, vencidos o urgentes avisan al momento, como siempre.
// Puro (sin base de datos): lo usan notifications.ts al encolar y upcoming.ts al calcular «Próximos envíos».
import { nearestAllowedMinute } from '@/lib/operaciones/quiet';
import { worksOn, type Schedule } from '@/lib/operaciones/team-profiles';

/** Instante UTC de «fecha local + minutos del día» en una zona horaria. */
export function zonedToMs(timezone: string, date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = (ms: number) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Math.floor(ms / 60000) * 60000;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const localDate = (timezone: string, ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(ms));
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Cuándo debe salir el aviso de un encargo nuevo. null = al momento.
 * Al momento: sin fecha, fecha de hoy o pasada, urgente (prioridad 1), ficha desactivada, o si el día que toca (o el
 * último laborable antes) ya es hoy. Si no: ese día a su hora de entrada (fuera de su comida o silencio).
 */
export function deferredNoticeAt(
  sch: Schedule,
  req: { dueDate: string | null; priority: number | null },
  nowMs: number
): { at: number; day: string } | null {
  if (!req.dueDate || req.priority === 1 || !sch.active) return null;
  const today = localDate(sch.timezone, nowMs);
  if (req.dueDate <= today) return null;
  let day = req.dueDate;
  // Si ese día no trabaja (fin de semana, festivo o ausencia), el último día laborable antes de la fecha.
  for (let i = 0; i < 31 && day > today && !worksOn(sch, day); i++) day = addDays(day, -1);
  if (day <= today || !worksOn(sch, day)) return null;
  const at = zonedToMs(sch.timezone, day, nearestAllowedMinute(sch, toMin(sch.workStart)));
  return at > nowMs ? { at, day } : null;
}
