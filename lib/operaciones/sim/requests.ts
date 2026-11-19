import 'server-only';
// «Pedir una prueba» (fase 2 de las pruebas simuladas, 19 nov 2026). Enric describe en Sistema → Pruebas un caso que
// quiere ver probado; Claude lo lee (scripts/server-status.sh lo lista) y lo convierte en un escenario en código con
// `fromRequest: <id>`. Al ejecutarse ese escenario por primera vez, la petición pasa sola a «hecha».
// Sin tabla nueva: una lista JSON en ops_settings (clave sim_test_requests) de la cuenta real; son pocas y cortas.
// No hay editor de pruebas en el panel (se acordó así): una petición es texto para Claude, nunca código que se ejecute.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSettings } from '@/lib/db/schema';

const KEY = 'sim_test_requests';
const MAX_OPEN = 30;
const MAX_TOTAL = 100;

export type TestRequest = {
  id: string;
  text: string;
  by: string;
  at: string;
  status: 'pendiente' | 'hecha' | 'retirada';
  scenarioKey?: string;
  doneAt?: string;
};

export class TestRequestError extends Error {}

async function load(tenantId: string): Promise<TestRequest[]> {
  const [row] = await db.select({ value: opsSettings.value }).from(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, KEY))).limit(1);
  if (!row) return [];
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? (list as TestRequest[]).filter((r) => r && typeof r.id === 'string' && typeof r.text === 'string') : [];
  } catch {
    return [];
  }
}

async function save(tenantId: string, list: TestRequest[]) {
  // Las hechas y retiradas más antiguas se van primero si se llega al tope.
  const keep = list.length > MAX_TOTAL ? [...list.filter((r) => r.status === 'pendiente'), ...list.filter((r) => r.status !== 'pendiente').slice(-(MAX_TOTAL - MAX_OPEN))] : list;
  const value = JSON.stringify(keep);
  await db
    .insert(opsSettings)
    .values({ tenantId, key: KEY, value })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value, updatedAt: new Date() } });
}

/** Las peticiones, las pendientes primero y luego las más recientes. */
export async function listTestRequests(tenantId: string): Promise<TestRequest[]> {
  const list = await load(tenantId);
  return [...list].sort((a, b) => (a.status === 'pendiente' ? 0 : 1) - (b.status === 'pendiente' ? 0 : 1) || b.at.localeCompare(a.at));
}

export async function addTestRequest(tenantId: string, text: string, by: string): Promise<TestRequest> {
  const clean = text.replace(/\s+\n/g, '\n').trim().slice(0, 2000);
  if (clean.length < 10) throw new TestRequestError('Describe el caso con un poco más de detalle (qué haces y qué debería pasar).');
  const list = await load(tenantId);
  if (list.filter((r) => r.status === 'pendiente').length >= MAX_OPEN) throw new TestRequestError(`Ya hay ${MAX_OPEN} pruebas pedidas sin hacer: espera a que se hagan o retira alguna.`);
  const req: TestRequest = { id: randomUUID().slice(0, 8), text: clean, by: by.slice(0, 120), at: new Date().toISOString(), status: 'pendiente' };
  await save(tenantId, [...list, req]);
  return req;
}

/** Retirar una petición pendiente (ya no hace falta). Las hechas se quedan como historial. */
export async function withdrawTestRequest(tenantId: string, id: string): Promise<void> {
  const list = await load(tenantId);
  const r = list.find((x) => x.id === id);
  if (!r) throw new TestRequestError('Esa petición ya no está.');
  if (r.status !== 'pendiente') throw new TestRequestError('Solo se pueden retirar las pendientes.');
  r.status = 'retirada';
  await save(tenantId, list);
}

/** Marca como hechas las peticiones cuyo escenario ya existe (lo llama el ejecutor al pasar las pruebas). */
export async function markTestRequestsDone(tenantId: string, done: { requestId: string; scenarioKey: string }[]): Promise<void> {
  if (!done.length) return;
  const list = await load(tenantId);
  let changed = false;
  for (const d of done) {
    const r = list.find((x) => x.id === d.requestId && x.status === 'pendiente');
    if (r) {
      r.status = 'hecha';
      r.scenarioKey = d.scenarioKey;
      r.doneAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) await save(tenantId, list);
}
