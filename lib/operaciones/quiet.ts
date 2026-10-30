// Comida y silencio por persona (ficha de Equipo): en ese hueco no se le envía nada.
// Los huecos son HH:MM en la zona de la persona y pueden cruzar la medianoche (21:00 → 08:00).
import type { Schedule } from '@/lib/operaciones/team-profiles';

export type Window = [number, number];

const toMin = (hhmm: string | null | undefined): number | null => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function windowsOf(sch: Pick<Schedule, 'lunchStart' | 'lunchEnd' | 'quietStart' | 'quietEnd'>): Window[] {
  const out: Window[] = [];
  for (const [a, b] of [
    [sch.lunchStart, sch.lunchEnd],
    [sch.quietStart, sch.quietEnd]
  ] as const) {
    const s = toMin(a);
    const e = toMin(b);
    if (s !== null && e !== null && s !== e) out.push([s, e]);
  }
  return out;
}

export const inWindows = (ws: Window[], m: number) => ws.some(([s, e]) => (s < e ? m >= s && m < e : m >= s || m < e));

export function minuteOfDay(timezone: string, ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return g('hour') * 60 + g('minute');
}

// ¿Está la persona en su hueco de silencio en ese instante? Los urgentes lo atraviesan si ella lo permite.
export function isQuietAt(sch: Schedule, ms: number, urgent = false): boolean {
  if (urgent && sch.urgentBypassQuiet) return false;
  const ws = windowsOf(sch);
  return ws.length > 0 && inWindows(ws, minuteOfDay(sch.timezone, ms));
}

// Primer instante permitido a partir de ms (los avisos que reaccionan a algo se retrasan, no se adelantan).
export function releaseAt(sch: Schedule, ms: number, urgent = false): number {
  if (!isQuietAt(sch, ms, urgent)) return ms;
  const start = Math.floor(ms / 60000) * 60000;
  for (let i = 1; i <= 24 * 60; i++) {
    const t = start + i * 60000;
    if (!isQuietAt(sch, t, urgent)) return t;
  }
  return ms;
}

// Para envíos programados a una hora fija: minuto del día permitido más cercano (adelanta o retrasa).
// En un empate gana el retraso. Si no cabe en el mismo día, se deja como está.
export function nearestAllowedMinute(sch: Schedule, minute: number): number {
  const ws = windowsOf(sch);
  if (!inWindows(ws, minute)) return minute;
  for (let d = 1; d <= 720; d++) {
    const f = minute + d;
    const b = minute - d;
    if (f < 1440 && !inWindows(ws, f)) return f;
    if (b >= 0 && !inWindows(ws, b)) return b;
  }
  return minute;
}
