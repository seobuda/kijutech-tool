// Jornada real (paso 5A): cálculo PURO del estado del día a partir de los registros de ops_work_events.
// Sin base de datos ni IA, para poder probarlo. Lo usan el bot, el planificador, los avisos, los
// recordatorios (minutos reales trabajados), «Equipo hoy», la pestaña Jornada y el resumen del dueño.

// «tarea» (paso 5B) = cambio de tarea activa: no cambia el estado del día, solo a qué tarea va el tiempo.
export type WorkKind = 'entrada' | 'descanso' | 'comida' | 'salida_urgente' | 'vuelta' | 'salida' | 'ausencia' | 'tarea';
export type PauseKind = 'descanso' | 'comida' | 'salida_urgente';
export type DayStatus = 'sin_empezar' | 'trabajando' | 'descanso' | 'comida' | 'fuera' | 'terminado' | 'ausente';

export const WORK_KINDS: WorkKind[] = ['entrada', 'descanso', 'comida', 'salida_urgente', 'vuelta', 'salida', 'ausencia', 'tarea'];
export const PAUSE_KINDS: PauseKind[] = ['descanso', 'comida', 'salida_urgente'];

export type TaskRef = { clickupTaskId?: string | null; name: string; requestId?: string | null };

export type DayEvent = {
  id: string;
  kind: WorkKind;
  at: number; // ms
  plannedMinutes: number | null;
  reason: string | null;
  source: string;
  task: TaskRef | null;
};

export type Pause = {
  eventId: string;
  kind: PauseKind;
  start: number;
  end: number | null; // null = sigue en curso
  planned: number | null;
  reason: string | null;
};

/** Tramo trabajado con una tarea activa (paso 5B). */
export type TaskPiece = { task: TaskRef | null; start: number; end: number };

export type DayState = {
  status: DayStatus;
  entradaAt: number | null; // primera entrada del día
  salidaAt: number | null; // última salida (si terminó)
  salidaSource: string | null; // 'auto' = cierre automático sin marcar
  firstTask: TaskRef | null;
  absenceReason: string | null;
  pauses: Pause[];
  current: Pause | null;
  workIntervals: [number, number][]; // tramos realmente trabajados (sin pausas)
  activeTask: TaskRef | null; // tarea a la que va el tiempo ahora (entrada o último cambio de tarea)
  taskPieces: TaskPiece[]; // tramos trabajados repartidos por tarea activa
  workedMin: number;
  breakMin: number;
  breakCount: number;
  lunchMin: number;
  exitMin: number;
  lastEventAt: number | null;
};

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000));

/** Estado del día. `events` = registros NO anulados de una persona y un día (en cualquier orden). */
export function computeDay(events: DayEvent[], now: number): DayState {
  const evs = [...events].sort((a, b) => a.at - b.at);
  const st: DayState = {
    status: 'sin_empezar',
    entradaAt: null,
    salidaAt: null,
    salidaSource: null,
    firstTask: null,
    absenceReason: null,
    pauses: [],
    current: null,
    workIntervals: [],
    activeTask: null,
    taskPieces: [],
    workedMin: 0,
    breakMin: 0,
    breakCount: 0,
    lunchMin: 0,
    exitMin: 0,
    lastEventAt: evs.length ? evs[evs.length - 1].at : null
  };
  let segStart: number | null = null; // inicio del tramo trabajado en curso

  const closeSegment = (at: number) => {
    if (segStart !== null && at > segStart) {
      st.workIntervals.push([segStart, at]);
      st.taskPieces.push({ task: st.activeTask, start: segStart, end: at });
    }
    segStart = null;
  };

  for (const e of evs) {
    switch (e.kind) {
      case 'ausencia':
        if (st.status === 'sin_empezar') {
          st.status = 'ausente';
          st.absenceReason = e.reason;
        }
        break;
      case 'entrada':
        if (st.status === 'sin_empezar' || st.status === 'terminado' || st.status === 'ausente') {
          if (st.entradaAt === null) {
            st.entradaAt = e.at;
            st.firstTask = e.task;
          }
          st.status = 'trabajando';
          st.salidaAt = null;
          st.salidaSource = null;
          st.absenceReason = null;
          st.activeTask = e.task;
          segStart = e.at;
        }
        break;
      case 'tarea':
        // Cambio de tarea activa: corta el tramo en curso para que lo anterior quede en la tarea anterior.
        if (st.status === 'trabajando') {
          closeSegment(e.at);
          st.activeTask = e.task;
          segStart = e.at;
        } else if (st.current) st.activeTask = e.task;
        break;
      case 'descanso':
      case 'comida':
      case 'salida_urgente':
        if (st.status === 'trabajando') {
          closeSegment(e.at);
          st.current = { eventId: e.id, kind: e.kind, start: e.at, end: null, planned: e.plannedMinutes, reason: e.reason };
          st.pauses.push(st.current);
          st.status = e.kind === 'salida_urgente' ? 'fuera' : e.kind;
        }
        break;
      case 'vuelta':
        if (st.current) {
          st.current.end = e.at;
          st.current = null;
          st.status = 'trabajando';
          segStart = e.at;
        }
        break;
      case 'salida':
        if (st.status === 'trabajando' || st.current) {
          if (st.current) {
            st.current.end = e.at;
            st.current = null;
          }
          closeSegment(e.at);
          st.status = 'terminado';
          st.salidaAt = e.at;
          st.salidaSource = e.source;
        }
        break;
    }
  }
  // Tramo abierto: cuenta hasta ahora.
  if (segStart !== null && st.status === 'trabajando' && now > segStart) {
    st.workIntervals.push([segStart, now]);
    st.taskPieces.push({ task: st.activeTask, start: segStart, end: now });
  }

  st.workedMin = minutes(st.workIntervals.reduce((s, [a, b]) => s + (b - a), 0));
  for (const p of st.pauses) {
    const d = minutes((p.end ?? now) - p.start);
    if (p.kind === 'descanso') {
      st.breakMin += d;
      st.breakCount++;
    } else if (p.kind === 'comida') st.lunchMin += d;
    else st.exitMin += d;
  }
  return st;
}

/** ¿Se puede hacer esta acción ahora? Devuelve el motivo si no (texto para la persona). */
export function transitionError(status: DayStatus, kind: WorkKind): string | null {
  switch (kind) {
    case 'entrada':
      if (status === 'trabajando') return 'Ya estás trabajando.';
      if (status === 'descanso' || status === 'comida' || status === 'fuera') return 'Estás en una pausa: pulsa «He vuelto».';
      return null;
    case 'descanso':
    case 'comida':
    case 'salida_urgente':
      if (status === 'sin_empezar' || status === 'ausente') return 'Aún no has empezado la jornada.';
      if (status === 'terminado') return 'Tu jornada de hoy ya terminó.';
      if (status !== 'trabajando') return 'Ya estás en una pausa: pulsa «He vuelto» primero.';
      return null;
    case 'vuelta':
      return status === 'descanso' || status === 'comida' || status === 'fuera' ? null : 'No estabas en ninguna pausa.';
    case 'salida':
      if (status === 'sin_empezar' || status === 'ausente') return 'Aún no has empezado la jornada.';
      if (status === 'terminado') return 'Tu jornada de hoy ya terminó.';
      return null;
    case 'ausencia':
      return status === 'sin_empezar' ? null : 'Ya has empezado la jornada de hoy.';
    case 'tarea':
      if (status === 'sin_empezar' || status === 'ausente') return 'Aún no has empezado la jornada.';
      if (status === 'terminado') return 'Tu jornada de hoy ya terminó.';
      return null;
  }
}

/** Personas fuera de su puesto: los avisos no urgentes esperan. */
export const AWAY_STATUSES: DayStatus[] = ['descanso', 'comida', 'fuera', 'terminado', 'ausente'];

/** Minutos de descanso por encima del cupo diario. */
export const breakOver = (st: DayState, quotaMin: number) => Math.max(0, st.breakMin - quotaMin);

export const STATUS_LABEL: Record<DayStatus, string> = {
  sin_empezar: 'Sin empezar',
  trabajando: 'Trabajando',
  descanso: 'En descanso',
  comida: 'Comiendo',
  fuera: 'Ha tenido que salir',
  terminado: 'Terminó',
  ausente: 'Ausente'
};

export const STATUS_ICON: Record<DayStatus, string> = {
  sin_empezar: '⚪',
  trabajando: '🟢',
  descanso: '☕',
  comida: '🍽',
  fuera: '🚪',
  terminado: '⏹',
  ausente: '🏠'
};

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Duración prevista de la comida según la ficha (HH:MM–HH:MM); sin hueco, 60 min. */
export function lunchPlannedMin(lunchStart: string | null, lunchEnd: string | null): number {
  const p = (s: string | null) => (s && /^\d{1,2}:\d{2}$/.test(s) ? Number(s.split(':')[0]) * 60 + Number(s.split(':')[1]) : null);
  const a = p(lunchStart);
  const b = p(lunchEnd);
  if (a === null || b === null || a === b) return 60;
  return b > a ? b - a : b + 1440 - a;
}

/** ¿El instante cae en algún tramo trabajado? */
export const inIntervals = (iv: [number, number][], t: number) => iv.some(([a, b]) => t >= a && t < b);
