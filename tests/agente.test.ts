// Motor de acciones del agente (paso 2): lógica que decide si una propuesta se aprobó a la primera,
// recomendaciones de autonomía y botones de Telegram. Sin base de datos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compareNoteProposal,
  decideAction,
  getAgentStats,
  getAutonomy,
  recommend,
  recordAction,
  setAutonomy
} from '@/lib/operaciones/agent-actions';
import { cleanupFixtures, createFixtures, type Fixtures } from './fixtures';
import { AGENT_CALLBACK_RE, FLOW_CALLBACK_RE } from '@/lib/operaciones/telegram-handler';

const item = (key: string, over: Partial<{ title: string; listId: string; assigneeId: string; dueDate: string; priority: number }> = {}) => ({
  key,
  title: 'Landing',
  listId: 'L1',
  assigneeId: '7',
  dueDate: '2026-11-20',
  priority: 3,
  ...over
});

describe('conversión de notas: ¿se envió lo que propuso la IA?', () => {
  it('igual que la propuesta → aprobada a la primera', () => {
    expect(compareNoteProposal([item('a'), item('b')], [item('a'), item('b')])).toEqual({
      status: 'aprobado',
      changed: 0,
      removed: 0,
      added: 0
    });
  });

  it('cambiar responsable, fecha, lista o título → corregida', () => {
    for (const over of [{ assigneeId: '9' }, { dueDate: '2026-11-21' }, { listId: 'L2' }, { title: 'Otra' }, { priority: 1 }]) {
      expect(compareNoteProposal([item('a')], [item('a', over)]).status).toBe('corregido');
    }
  });

  it('quitar o añadir encargos → corregida y lo cuenta', () => {
    expect(compareNoteProposal([item('a'), item('b')], [item('a')])).toMatchObject({ status: 'corregido', removed: 1 });
    expect(compareNoteProposal([item('a')], [item('a'), item('c')])).toMatchObject({ status: 'corregido', added: 1 });
  });

  it('espacios al principio o al final del título no cuentan como corrección', () => {
    expect(compareNoteProposal([item('a')], [item('a', { title: '  Landing ' })]).status).toBe('aprobado');
  });
});

describe('recomendación de autonomía', () => {
  const base = { allowed: ['sombra', 'aprobacion', 'autonomo'] as ('sombra' | 'aprobacion' | 'autonomo')[] };

  it('sin datos suficientes (menos de 30 decisiones) no recomienda nada', () => {
    expect(recommend({ ...base, autonomy: 'aprobacion', approved: 29, corrected: 0, rejected: 0 })).toBeNull();
  });

  it('con ≥ 95 % de acierto propone pasar a autónomo', () => {
    expect(recommend({ ...base, autonomy: 'aprobacion', approved: 30, corrected: 1, rejected: 0 })).toMatch(/autónomo/);
  });

  it('en autónomo con poco acierto propone volver a «con tu aprobación»', () => {
    expect(recommend({ ...base, autonomy: 'autonomo', approved: 20, corrected: 10, rejected: 5 })).toMatch(/aprobación/);
  });

  it('no recomienda autónomo si el tipo no lo permite', () => {
    expect(recommend({ allowed: ['aprobacion'], autonomy: 'aprobacion', approved: 40, corrected: 0, rejected: 0 })).toBeNull();
  });
});

describe('botones de propuesta en Telegram', () => {
  const id = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';
  it('se reconocen y no se confunden con los del flujo', () => {
    expect(`ag:${id}:ok`).toMatch(AGENT_CALLBACK_RE);
    expect(`ag:${id}:no`).toMatch(AGENT_CALLBACK_RE);
    expect(`ag:${id}:si`).not.toMatch(AGENT_CALLBACK_RE);
    expect(`ag:${id}:ok`).not.toMatch(FLOW_CALLBACK_RE);
  });
});

// Con base de datos, sobre la cuenta de prueba «otra cuenta» (se borra al final con todo lo suyo).
describe('motor de acciones con base de datos', () => {
  let fx: Fixtures;
  beforeAll(async () => {
    fx = await createFixtures();
  });
  afterAll(async () => {
    await cleanupFixtures();
  });

  it('la autonomía por defecto y su cambio se respetan, y no admite niveles no permitidos', async () => {
    const t = fx.otherTenantId;
    expect(await getAutonomy(t, 'blocker_answer')).toBe('autonomo');
    await setAutonomy(t, 'blocker_answer', 'aprobacion');
    expect(await getAutonomy(t, 'blocker_answer')).toBe('aprobacion');
    await expect(setAutonomy(t, 'note_conversion', 'autonomo')).rejects.toThrow();
  });

  it('una propuesta se decide una sola vez y la clave única evita duplicados', async () => {
    const t = fx.otherTenantId;
    const a = await recordAction({
      tenantId: t,
      kind: 'blocker_answer',
      status: 'propuesto',
      autonomy: 'aprobacion',
      summary: 'prueba',
      proposal: { answer: 'Sí, usa el logo nuevo', source: 'descripción' },
      dedupeKey: 'prueba:1'
    });
    expect(a?.status).toBe('propuesto');
    const dup = await recordAction({
      tenantId: t,
      kind: 'blocker_answer',
      status: 'propuesto',
      autonomy: 'aprobacion',
      summary: 'prueba',
      proposal: {},
      dedupeKey: 'prueba:1'
    });
    expect(dup).toBeNull();

    const first = await decideAction(t, a!.id, { status: 'aprobado', via: 'telegram', byName: 'Enric' });
    expect(first?.status).toBe('aprobado');
    const second = await decideAction(t, a!.id, { status: 'rechazado', via: 'panel', byName: 'Enric' });
    expect(second).toBeNull();
  });

  it('otra cuenta no puede decidir una propuesta ajena', async () => {
    const t = fx.otherTenantId;
    const a = await recordAction({
      tenantId: t,
      kind: 'blocker_answer',
      status: 'propuesto',
      autonomy: 'aprobacion',
      summary: 'ajena',
      proposal: { answer: 'x' },
      dedupeKey: 'prueba:2'
    });
    expect(await decideAction(fx.kijutechTenantId, a!.id, { status: 'aprobado', via: 'panel', byName: 'x' })).toBeNull();
  });

  it('las estadísticas cuentan aprobadas, corregidas y autónomas', async () => {
    const t = fx.otherTenantId;
    await recordAction({
      tenantId: t,
      kind: 'note_conversion',
      status: 'corregido',
      autonomy: 'aprobacion',
      summary: 'nota',
      proposal: { items: [] },
      decidedVia: 'panel',
      decidedByName: 'Enric',
      dedupeKey: 'prueba:3'
    });
    await recordAction({
      tenantId: t,
      kind: 'blocker_answer',
      status: 'auto',
      autonomy: 'autonomo',
      summary: 'auto',
      proposal: { answer: 'y' },
      decidedVia: 'agente',
      dedupeKey: 'prueba:4'
    });
    const stats = await getAgentStats(t, 30);
    const blocker = stats.find((s) => s.kind === 'blocker_answer')!;
    const note = stats.find((s) => s.kind === 'note_conversion')!;
    expect(blocker.approved).toBe(1);
    expect(blocker.auto).toBe(1);
    expect(blocker.pending).toBe(1);
    expect(note.corrected).toBe(1);
    expect(note.hitRate).toBe(0);
  });
});
