// Preguntas al cliente (25 nov 2026; docs/DISENO-PREGUNTAS-CLIENTE.md): reglas puras y, contra la base de datos, en una
// cuenta de pruebas propia, el recorrido completo: banco → preguntas del cliente por sus servicios → envío por correo
// (con aprobación) o por cuestionario en línea → respuestas a la ficha, a la memoria o al módulo que las pidió.
// Sin IA real: las respuestas por correo se prueban con la limpieza pura; el buzón y los servicios, simulados.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientContacts, clientMemory, clientMessages, clientQuestionnaires, clientQuestions, clients, tenants } from '@/lib/db/schema';
import {
  cleanAnswer,
  cleanExtracted,
  cleanProposals,
  ensureLink,
  fillTemplate,
  quoteInText,
  suggestedDelivery,
  templatesToClose,
  templatesToOpen,
  validateQuestionInput
} from '@/lib/core/questions-rules';
import {
  addLooseQuestion,
  answerManually,
  autoPrepareQuestions,
  cancelQuestionnaire,
  clientQuestionsView,
  createTemplate,
  deleteTemplate,
  openQuestionnaire,
  prepareQuestionsSend,
  saveCommsTemplate,
  saveQuestionnaireDraft,
  setQuestionStatus,
  submitQuestionnaire,
  syncClientQuestions,
  updateTemplate
} from '@/lib/core/questions';
import { rejectClientMessage, setContactSubscriptions } from '@/lib/core/comms';
import {
  clientServicesSource,
  registerClientAnswerHandler,
  registerClientQuestionSource,
  registerCommsApprovalNotifier,
  registerMailSender,
  setClientServicesSource,
  type ModuleAnswer
} from '@/lib/core/capabilities';

const day = 86_400_000;

describe('preguntas: qué le toca a cada cliente', () => {
  const now = new Date('2037-06-01T10:00:00Z');
  const T = (id: string, serviceKey: string | null, extra: Partial<{ active: boolean; askWhen: string; repeatDays: number | null }> = {}) => ({ id, serviceKey, active: true, askWhen: 'alta', repeatDays: null, ...extra });
  const row = (templateId: string, status: string, answeredDaysAgo?: number) => ({
    templateId,
    status,
    answeredAt: answeredDaysAgo === undefined ? null : new Date(now.getTime() - answeredDaysAgo * day),
    updatedAt: now
  });

  it('las generales a todos; las de un servicio, solo a quien lo tiene; las inactivas a nadie', () => {
    const tpls = [T('g', null), T('seo', 'seo'), T('ads', 'google_ads'), T('off', null, { active: false })];
    expect(templatesToOpen(tpls, ['seo'], [], now)).toEqual(['g', 'seo']);
    expect(templatesToOpen(tpls, [], [], now)).toEqual(['g']);
  });

  it('no se repite lo abierto, lo respondido ni lo que «no aplica»', () => {
    const tpls = [T('a', null), T('b', null), T('c', null), T('d', null)];
    expect(templatesToOpen(tpls, [], [row('a', 'pendiente'), row('b', 'respondida', 5), row('c', 'no_aplica')], now)).toEqual(['d']);
  });

  it('una periódica vuelve cuando pasa su plazo desde la última respuesta', () => {
    const tpls = [T('p', null, { askWhen: 'periodica', repeatDays: 90 })];
    expect(templatesToOpen(tpls, [], [row('p', 'respondida', 30)], now)).toEqual([]);
    expect(templatesToOpen(tpls, [], [row('p', 'respondida', 120), row('p', 'respondida', 91)], now)).toEqual(['p']);
  });

  it('se quitan las pendientes de un servicio que ya no se le hace, salvo si se editaron para él', () => {
    const tpls = [T('seo', 'seo')];
    const rows = [
      { ...row('seo', 'pendiente'), id: 'r1' },
      { ...row('seo', 'pendiente'), id: 'r2', customText: true },
      { ...row('seo', 'enviada'), id: 'r3' }
    ];
    expect(templatesToClose(tpls, [], rows)).toEqual(['r1']);
    expect(templatesToClose(tpls, ['seo'], rows)).toEqual([]);
  });
});

describe('preguntas: formulario, envío y textos', () => {
  it('valida la pregunta: texto, tipo, destino y plazo de las periódicas', () => {
    expect(validateQuestionInput({ text: '¿Qué presupuesto tenéis?', answerType: 'numero', target: 'memoria', askWhen: 'alta' }).ok).toBe(true);
    expect(validateQuestionInput({ text: 'ab', answerType: 'texto', target: 'memoria', askWhen: 'alta' }).ok).toBe(false);
    expect(validateQuestionInput({ text: '¿Algo?  ', answerType: 'otro', target: 'memoria', askWhen: 'alta' }).ok).toBe(false);
    expect(validateQuestionInput({ text: '¿Algo nuevo?', answerType: 'texto', target: 'seo:x', askWhen: 'alta' }).ok).toBe(false);
    expect(validateQuestionInput({ text: '¿Algo nuevo?', answerType: 'texto', target: 'memoria', askWhen: 'periodica', repeatDays: 3 }).ok).toBe(false);
    const ok = validateQuestionInput({ text: '¿Promociones?', answerType: 'texto', target: 'memoria', askWhen: 'periodica', repeatDays: 60 });
    expect(ok.ok && ok.value.repeatDays).toBe(60);
  });

  it('hasta 5 preguntas, correo; con más, cuestionario', () => {
    expect(suggestedDelivery(5)).toBe('correo');
    expect(suggestedDelivery(6)).toBe('cuestionario');
  });

  it('los huecos se rellenan en una sola pasada (un valor no cuela otro hueco) y el enlace no se pierde', () => {
    expect(fillTemplate('Hola {cliente}: {preguntas} {raro}', { cliente: '{preguntas}', preguntas: '1. ¿Algo?' })).toBe('Hola {preguntas}: 1. ¿Algo? {raro}');
    expect(ensureLink('Rellenad esto')).toContain('{enlace}');
    expect(ensureLink('Aquí: {enlace}')).toBe('Aquí: {enlace}');
  });
});

describe('preguntas: respuestas', () => {
  it('limpia cada tipo de respuesta', () => {
    expect(cleanAnswer('lista', '- Reformas\n- Baños, cocinas\n\n')?.value).toEqual(['Reformas', 'Baños', 'cocinas']);
    expect(cleanAnswer('si_no', 'Sí, desde 2019')).toEqual({ value: true, text: 'Sí, desde 2019' });
    expect(cleanAnswer('si_no', 'No')?.value).toBe(false);
    expect(cleanAnswer('si_no', 'Nosotros lo llevamos')?.value).toBeNull();
    expect(cleanAnswer('numero', 'Unos 1.500,50 € al mes')?.value).toBe(1500.5);
    expect(cleanAnswer('direccion', { calle: 'C/ Mayor 1', codigo_postal: '08001', poblacion: 'Barcelona', provincia: '' })?.text).toBe('C/ Mayor 1, 08001 Barcelona');
    expect(cleanAnswer('texto', '   ')).toBeNull();
  });

  it('de lo que lee la IA, solo vale lo que tiene cita literal en el correo y es de una pregunta hecha', () => {
    const text = 'Hola! Queremos invertir unos 600 € al mes. La zona es el Vallès.';
    const asked = [
      { id: 'q1', n: 1, type: 'numero' },
      { id: 'q2', n: 2, type: 'texto' }
    ];
    const raw = {
      respuestas: [
        { n: 1, valor: '600 € al mes', cita: 'invertir unos 600 € al mes' },
        { n: 2, valor: 'Todo Cataluña', cita: 'toda Cataluña' }, // cita inventada
        { n: 7, valor: 'x', cita: 'Hola' } // pregunta que no se hizo
      ]
    };
    expect(cleanExtracted(raw, asked, text)).toEqual([{ id: 'q1', value: 600, text: '600 € al mes', quote: 'invertir unos 600 € al mes' }]);
    expect(quoteInText('LA ZONA es  el valles', text)).toBe(true);
  });

  it('las propuestas de la IA: forma válida, sin repetir las que ya hay, destino seguro', () => {
    const raw = {
      preguntas: [
        { texto: '¿Qué presupuesto mensual tenéis?', para_que: 'Para repartir campañas', tipo: 'numero', destino: 'memoria' },
        { texto: '¿Qué presupuesto mensual tenéis?', tipo: 'numero' }, // repetida
        { texto: '¿Tenéis promociones?', tipo: 'texto', destino: 'seo:hackeo', cada_dias: 60 }, // destino no permitido → memoria
        { texto: 'x', tipo: 'texto' } // demasiado corta
      ]
    };
    const out = cleanProposals(raw, ['¿Tenéis web?']);
    expect(out.map((p) => p.text)).toEqual(['¿Qué presupuesto mensual tenéis?', '¿Tenéis promociones?']);
    expect(out[1]).toMatchObject({ target: 'memoria', askWhen: 'periodica', repeatDays: 60 });
  });
});

// --- Base de datos ----------------------------------------------------------------------------------------------------

const SLUG = 'seg-test-preguntas';
let T = '';
let CLIENT = '';
let OTHER = '';
const services: Record<string, string[]> = {};
const sent: { subject: string; text: string }[] = [];
const moduleAnswers: ModuleAnswer[] = [];
let moduleQuestions: { key: string; text: string }[] = [];

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(clients).where(eq(clients.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('preguntas al cliente (base de datos)', () => {
  let G1 = '';
  let SEO1 = '';
  let ADS1 = '';
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Pruebas preguntas', slug: SLUG }).returning();
    T = t.id;
    const [c] = await db.insert(clients).values({ tenantId: T, name: 'Reformas Prueba', area: '' }).returning();
    const [o] = await db.insert(clients).values({ tenantId: T, name: 'Otro Prueba' }).returning();
    CLIENT = c.id;
    OTHER = o.id;
    services[CLIENT] = ['seo'];
    services[OTHER] = [];
    const prev = clientServicesSource();
    setClientServicesSource({
      all: async (tid) => (tid === T ? [{ key: 'seo', label: 'SEO' }, { key: 'google_ads', label: 'Google Ads' }] : (prev?.all(tid) ?? [])),
      ofClient: async (tid, cid) => (tid === T ? services[cid] ?? [] : (prev?.ofClient(tid, cid) ?? [])),
      clientsWithServices: async (tid) => (tid === T ? Object.keys(services).filter((k) => services[k].length) : (prev?.clientsWithServices(tid) ?? []))
    });
    registerMailSender({ send: async (_t, m) => (sent.push({ subject: m.subject, text: m.text }), { providerId: `p-${sent.length}` }), domain: async () => 'equipo.kijutech.test' });
    registerCommsApprovalNotifier({ notify: async () => undefined, decided: async () => undefined });
    registerClientQuestionSource('pruebas', async (tid, cid) => (tid === T && cid === CLIENT ? moduleQuestions.map((q) => ({ sourceKey: q.key, target: q.key, text: q.text, help: null, answerType: 'texto' as const, serviceKey: null, projectId: null, coveredBy: q.key.endsWith(':zona') ? 'ficha.area' : null })) : []));
    registerClientAnswerHandler('pruebas', async (a) => void moduleAnswers.push(a));
    G1 = await createTemplate(T, { serviceKey: null, text: '¿Qué queréis conseguir este año?', answerType: 'texto', target: 'ficha.goals', askWhen: 'alta' }, 'Prueba');
    SEO1 = await createTemplate(T, { serviceKey: 'seo', text: '¿En qué zonas queréis clientes?', answerType: 'texto', target: 'ficha.area', askWhen: 'alta' }, 'Prueba');
    ADS1 = await createTemplate(T, { serviceKey: 'google_ads', text: '¿Cuánto queréis invertir al mes?', answerType: 'numero', target: 'memoria', askWhen: 'alta' }, 'Prueba');
  });
  afterAll(cleanup);

  const rowsOf = (cid: string) => db.select().from(clientQuestions).where(eq(clientQuestions.clientId, cid));

  it('abre las del banco según sus servicios, sin duplicar al repetir', async () => {
    await syncClientQuestions(T, CLIENT);
    await syncClientQuestions(T, CLIENT);
    const rows = await rowsOf(CLIENT);
    expect(rows.map((r) => r.templateId).sort()).toEqual([G1, SEO1].sort());
    await syncClientQuestions(T, OTHER);
    expect((await rowsOf(OTHER)).map((r) => r.templateId)).toEqual([G1]);
  });

  it('cambiar el banco pone al día las pendientes; añadir un servicio abre las suyas; quitarlo las cierra', async () => {
    await updateTemplate(T, G1, { text: '¿Qué queréis conseguir en 12 meses?', answerType: 'texto', target: 'ficha.goals', askWhen: 'alta', active: true }, 'Prueba');
    expect((await rowsOf(CLIENT)).find((r) => r.templateId === G1)?.text).toBe('¿Qué queréis conseguir en 12 meses?');
    services[CLIENT] = ['seo', 'google_ads'];
    await syncClientQuestions(T, CLIENT);
    expect((await rowsOf(CLIENT)).some((r) => r.templateId === ADS1)).toBe(true);
    services[CLIENT] = ['seo'];
    await syncClientQuestions(T, CLIENT);
    expect((await rowsOf(CLIENT)).some((r) => r.templateId === ADS1)).toBe(false);
  });

  it('las de un módulo entran como «dato» y desaparecen cuando el dato ya no falta; no se duplican con el banco', async () => {
    moduleQuestions = [
      { key: 'pruebas:telefono', text: '¿Qué teléfono ponemos?' },
      { key: 'pruebas:zona', text: '¿Zona?' } // la cubre la pregunta del banco que va a la ficha (zona)
    ];
    await syncClientQuestions(T, CLIENT);
    let dato = (await rowsOf(CLIENT)).filter((r) => r.origin === 'dato');
    expect(dato.map((r) => r.sourceKey)).toEqual(['pruebas:telefono']);
    moduleQuestions = [];
    await syncClientQuestions(T, CLIENT);
    dato = (await rowsOf(CLIENT)).filter((r) => r.origin === 'dato');
    expect(dato).toEqual([]);
    moduleQuestions = [{ key: 'pruebas:telefono', text: '¿Qué teléfono ponemos?' }];
    await syncClientQuestions(T, CLIENT);
  });

  it('sin contacto que reciba «Preguntas», no se puede enviar; la vista lo dice y ofrece los contactos', async () => {
    const [ct] = await db.insert(clientContacts).values({ tenantId: T, clientId: CLIENT, name: 'Dueño', email: 'dueno@reformas-prueba.es' }).returning();
    const v = await clientQuestionsView(T, CLIENT);
    expect(v.recipients).toEqual([]);
    expect(v.candidates.map((c) => c.id)).toEqual([ct.id]);
    const ids = v.questions.filter((q) => q.status === 'pendiente').map((q) => q.id);
    await expect(prepareQuestionsSend(T, CLIENT, { ids, delivery: 'correo' }, { kind: 'persona', name: 'Prueba' })).rejects.toThrow(/no tiene ningún contacto/);
    // El fallo no deja nada a medias.
    expect((await rowsOf(CLIENT)).every((r) => r.status === 'pendiente')).toBe(true);
    await setContactSubscriptions(T, ct.id, ['preguntas']);
  });

  it('por correo: queda esperando aprobación con el texto del banco; descartarlo devuelve las preguntas', async () => {
    await saveCommsTemplate(T, 'preguntas_correo', 'Dudas de {cliente}', 'Hola:\n\n{preguntas}\n\nGracias', 'Prueba');
    const v = await clientQuestionsView(T, CLIENT);
    const ids = v.questions.filter((q) => q.status === 'pendiente').map((q) => q.id);
    const r = await prepareQuestionsSend(T, CLIENT, { ids, delivery: 'correo' }, { kind: 'persona', name: 'Prueba' });
    expect(r).toMatchObject({ status: 'pendiente_aprobacion', delivery: 'correo', count: ids.length });
    const [m] = await db.select().from(clientMessages).where(and(eq(clientMessages.clientId, CLIENT), eq(clientMessages.kind, 'preguntas')));
    expect(m.subject).toBe('Dudas de Reformas Prueba');
    expect(m.bodyText).toMatch(/^Hola:\n\n1\. .+\n2\. .+/);
    expect((await rowsOf(CLIENT)).filter((x) => ids.includes(x.id)).every((x) => x.status === 'enviada' && x.messageId === m.id)).toBe(true);
    // Mientras espera, no se puede preparar otro.
    await expect(prepareQuestionsSend(T, CLIENT, { ids: [ids[0]], delivery: 'correo' }, { kind: 'persona', name: 'Prueba' })).rejects.toThrow();
    await rejectClientMessage(T, m.id, 'Prueba');
    await syncClientQuestions(T, CLIENT);
    expect((await rowsOf(CLIENT)).filter((x) => ids.includes(x.id)).every((x) => x.status === 'pendiente' && x.messageId === null)).toBe(true);
  });

  it('a mano: la respuesta va a la ficha si estaba vacía, y si no, se avisa de que es distinta', async () => {
    const rows = await rowsOf(CLIENT);
    const goals = rows.find((r) => r.templateId === G1)!;
    await db.update(clients).set({ goals: 'Más presupuestos' }).where(eq(clients.id, CLIENT));
    await answerManually(T, goals.id, 'Abrir en Sabadell', 'Prueba');
    const [g] = await db.select().from(clientQuestions).where(eq(clientQuestions.id, goals.id));
    expect(g).toMatchObject({ status: 'respondida', answeredVia: 'manual', applied: 'distinta' });
    const [c] = await db.select().from(clients).where(eq(clients.id, CLIENT));
    expect(c.goals).toBe('Más presupuestos'); // no se pisa
  });

  it('cuestionario en línea: enlace privado, borradores, envío → ficha, memoria y módulo; el enlace deja de valer', async () => {
    const loose = await addLooseQuestion(T, CLIENT, { text: '¿Tenéis promociones este año?', answerType: 'si_no', target: 'memoria' });
    const pend = (await rowsOf(CLIENT)).filter((r) => r.status === 'pendiente');
    expect(pend.map((r) => r.id)).toContain(loose);
    const r = await prepareQuestionsSend(T, CLIENT, { ids: pend.map((p) => p.id), delivery: 'cuestionario' }, { kind: 'persona', name: 'Prueba' });
    expect(r.delivery).toBe('cuestionario');
    const [m] = await db.select().from(clientMessages).where(and(eq(clientMessages.clientId, CLIENT), eq(clientMessages.status, 'pendiente_aprobacion')));
    const token = /\/cuestionario\/([A-Za-z0-9_-]{32})/.exec(m.bodyText)?.[1];
    expect(token).toBeTruthy();
    // En la base de datos solo está el hash.
    const [qn] = await db.select().from(clientQuestionnaires).where(eq(clientQuestionnaires.clientId, CLIENT));
    expect(qn.tokenHash).not.toContain(token!);
    expect(qn.tokenHash).toHaveLength(64);

    const pub = await openQuestionnaire(token!);
    expect(pub?.status).toBe('activo');
    expect(pub?.clientName).toBe('Reformas Prueba');
    expect(pub?.questions.length).toBe(pend.length);
    expect(await openQuestionnaire('x'.repeat(32))).toBeNull();

    const zona = pend.find((p) => p.templateId === SEO1)!;
    const tel = pend.find((p) => p.sourceKey === 'pruebas:telefono')!;
    await saveQuestionnaireDraft(token!, zona.id, 'Vallès Occidental');
    await saveQuestionnaireDraft(token!, tel.id, '600 11 22 33');
    await saveQuestionnaireDraft(token!, loose, 'Sí, en primavera');
    // Una pregunta de otro cliente no se puede tocar con este enlace.
    const other = (await rowsOf(OTHER))[0];
    await expect(saveQuestionnaireDraft(token!, other.id, 'x')).rejects.toThrow();
    // El borrador aún no es respuesta.
    expect((await db.select().from(clientQuestions).where(eq(clientQuestions.id, zona.id)))[0].status).toBe('enviada');

    const done = await submitQuestionnaire(token!);
    expect(done).toEqual({ answered: 3, total: pend.length });
    const after = await rowsOf(CLIENT);
    expect(after.find((x) => x.id === zona.id)).toMatchObject({ status: 'respondida', answeredVia: 'cuestionario', applied: 'aplicada' });
    const [c] = await db.select().from(clients).where(eq(clients.id, CLIENT));
    expect(c.area).toBe('Vallès Occidental'); // estaba vacía
    const mem = await db.select().from(clientMemory).where(eq(clientMemory.clientId, CLIENT));
    expect(mem.some((x) => x.text.includes('promociones') && x.text.includes('Sí, en primavera'))).toBe(true);
    expect(moduleAnswers).toEqual([expect.objectContaining({ target: 'pruebas:telefono', text: '600 11 22 33', via: 'cuestionario', clientId: CLIENT })]);
    expect((await openQuestionnaire(token!))?.status).toBe('completado');
    await expect(saveQuestionnaireDraft(token!, zona.id, 'otra')).rejects.toThrow(/ya no está activo/);
    await rejectClientMessage(T, m.id, 'Prueba');
  });

  it('anular un cuestionario guarda lo escrito y devuelve lo demás a pendiente', async () => {
    await addLooseQuestion(T, CLIENT, { text: '¿Cuántos empleados sois?', answerType: 'numero', target: 'memoria' });
    await addLooseQuestion(T, CLIENT, { text: '¿Tenéis catálogo en PDF?', answerType: 'si_no', target: 'memoria' });
    await syncClientQuestions(T, CLIENT);
    const pend = (await rowsOf(CLIENT)).filter((r) => r.status === 'pendiente');
    // El dato que el cliente acaba de contestar no se le vuelve a preguntar aunque el módulo lo siga pidiendo.
    expect(pend.some((r) => r.sourceKey === 'pruebas:telefono')).toBe(false);
    expect(pend.length).toBe(2);
    await prepareQuestionsSend(T, CLIENT, { ids: pend.map((p) => p.id), delivery: 'cuestionario' }, { kind: 'persona', name: 'Prueba' });
    const [m] = await db.select().from(clientMessages).where(and(eq(clientMessages.clientId, CLIENT), eq(clientMessages.status, 'pendiente_aprobacion')));
    const token = /\/cuestionario\/([A-Za-z0-9_-]{32})/.exec(m.bodyText)![1];
    await saveQuestionnaireDraft(token, pend[0].id, 'Respuesta a medias');
    const [qn] = await db.select().from(clientQuestionnaires).where(and(eq(clientQuestionnaires.clientId, CLIENT), eq(clientQuestionnaires.status, 'activo')));
    await cancelQuestionnaire(T, CLIENT, qn.id);
    const rows = await rowsOf(CLIENT);
    expect(rows.find((r) => r.id === pend[0].id)?.status).toBe('respondida');
    expect(rows.filter((r) => pend.slice(1).some((p) => p.id === r.id)).every((r) => r.status === 'pendiente')).toBe(true);
    await rejectClientMessage(T, m.id, 'Prueba');
  });

  it('«no aplica» no vuelve a salir; una suelta se borra; recuperar la devuelve', async () => {
    await syncClientQuestions(T, CLIENT);
    const loose = await addLooseQuestion(T, CLIENT, { text: '¿Pregunta de un solo uso?', answerType: 'texto', target: 'memoria' });
    await setQuestionStatus(T, loose, 'no_aplica');
    expect((await rowsOf(CLIENT)).some((r) => r.id === loose)).toBe(false);
    const ads = await createTemplate(T, { serviceKey: null, text: '¿Tenéis tienda física?', answerType: 'si_no', target: 'memoria', askWhen: 'alta' }, 'Prueba');
    await syncClientQuestions(T, CLIENT);
    const row = (await rowsOf(CLIENT)).find((r) => r.templateId === ads)!;
    await setQuestionStatus(T, row.id, 'no_aplica');
    await syncClientQuestions(T, CLIENT);
    expect((await rowsOf(CLIENT)).filter((r) => r.templateId === ads).map((r) => r.status)).toEqual(['no_aplica']);
    await setQuestionStatus(T, row.id, 'pendiente');
    expect((await rowsOf(CLIENT)).find((r) => r.id === row.id)?.status).toBe('pendiente');
    // Borrar del banco quita sus pendientes.
    await deleteTemplate(T, ads);
    expect((await rowsOf(CLIENT)).some((r) => r.id === row.id)).toBe(false);
  });

  it('envío automático: una vez, y no si se le escribió hace poco', async () => {
    await db.delete(clientMessages).where(eq(clientMessages.clientId, CLIENT));
    const first = await autoPrepareQuestions(T, CLIENT, { kind: 'sistema', name: 'Prueba' });
    expect(first.prepared).toBe(true);
    const second = await autoPrepareQuestions(T, CLIENT, { kind: 'sistema', name: 'Prueba' });
    expect(second.prepared).toBe(false);
  });
});
