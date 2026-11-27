import 'server-only';

// SEO · Local, tanda 5c: teléfonos antiguos que siguen publicados en otras webs (27 nov 2026; docs/DISENO-SEO-CITAS-ZONAS.md).
// Lo que más valor da de las «citas»: un teléfono viejo en un directorio o una web ajena hace perder llamadas. Se buscan
// en Google (DataForSEO en directo por el núcleo, unos 0,002 $ por búsqueda, con el tope de gasto) los teléfonos antiguos
// o distintos del actual que conoce el sistema (expediente, fotos de la ficha y los que añada una persona).
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoDossierFacts, seoLocalPlaces, seoLocalSnapshots } from '@/lib/db/schema';
import { serpSource } from '@/lib/core/capabilities';
import { syncFindings } from '@/lib/core/findings';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { host } from '@/lib/seo/expediente/rules';
import { canSpend, recordDataSpend } from '@/lib/seo/gasto';
import { NAP_SOURCE, oldPhones, phone9, phoneHits, phoneQuery } from '@/lib/seo/local/citas-zonas-rules';

const SEARCH_COST = 0.002;
type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };

export async function runNap(tenantId: string, projectId: string): Promise<Outcome> {
  const src = serpSource();
  if (!src || !(await src.isConnected(tenantId).catch(() => false))) return { status: 'omitido', summary: 'DataForSEO no está conectado (Agentes → Integraciones).' };
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) return { status: 'omitido', summary: 'El proyecto no tiene cliente.' };
  // Teléfono actual: el de la ficha de Google confirmada; si no, el confirmado del expediente.
  const [place] = await db.select({ id: seoLocalPlaces.id }).from(seoLocalPlaces).where(and(eq(seoLocalPlaces.clientId, p.clientId), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'confirmada'))).limit(1);
  const snaps = place ? await db.select({ phone: seoLocalSnapshots.phone }).from(seoLocalSnapshots).where(eq(seoLocalSnapshots.placeRowId, place.id)).orderBy(desc(seoLocalSnapshots.takenAt)).limit(30) : [];
  const facts = await db.select({ field: seoDossierFacts.field, value: seoDossierFacts.value, status: seoDossierFacts.status }).from(seoDossierFacts).where(eq(seoDossierFacts.projectId, projectId));
  const confirmedPhone = facts.find((f) => f.field === 'telefono' && f.status === 'confirmado')?.value;
  const current = snaps[0]?.phone ?? (typeof confirmedPhone === 'string' ? confirmedPhone : null);
  if (!phone9(current)) return { status: 'omitido', summary: 'No sabemos su teléfono actual: confirma su ficha de Google o el teléfono del expediente.' };
  const known: string[] = [
    ...snaps.map((s) => s.phone ?? ''),
    // Del expediente solo lo confirmado (un teléfono secundario provisional o uno descartado no es «antiguo»).
    ...facts.filter((f) => f.field === 'telefono' && f.status === 'confirmado' && typeof f.value === 'string').map((f) => f.value as string),
    ...facts.filter((f) => f.field === 'telefonos_antiguos' && f.status !== 'descartado' && Array.isArray(f.value)).flatMap((f) => (f.value as unknown[]).map(String))
  ];
  const old = oldPhones(known, current);
  if (!old.length) {
    await syncFindings(tenantId, projectId, NAP_SOURCE, [], ['seo.old_nap_found']);
    return { status: 'ok', summary: 'No conocemos teléfonos antiguos que buscar (puedes añadirlos en el Expediente → «Teléfonos antiguos»).' };
  }
  const clientDomain = host(await projectWebUrl(tenantId, projectId));
  const found: Parameters<typeof syncFindings>[3] = [];
  let searched = 0;
  for (const p9 of old) {
    if (!(await canSpend(projectId, SEARCH_COST)).ok) break;
    // Un fallo en un teléfono no relanza el trabajo (se volverían a pagar los ya buscados): se sigue con el siguiente.
    let r: Awaited<ReturnType<typeof src.search>>;
    try {
      r = await src.search(tenantId, { keyword: phoneQuery(p9), location: 'Spain', language: 'es', depth: 20 });
    } catch (e) {
      console.error('[seo] nap: búsqueda fallida:', e instanceof Error ? e.message : e);
      await recordDataSpend(tenantId, projectId, 'serp', 'local: teléfono antiguo publicado (fallida)', SEARCH_COST);
      continue;
    }
    await recordDataSpend(tenantId, projectId, 'serp', 'local: teléfono antiguo publicado', r.costUsd ?? SEARCH_COST);
    searched++;
    const hits = phoneHits(r.organic, p9, clientDomain);
    if (hits.length) found.push({ kind: 'seo.old_nap_found', dedupeKey: `seo.old_nap_found:${p9}`, url: hits[0], metric: 'webs', value: hits.length, evidence: { phone: p9, urls: hits } });
  }
  // Solo se decide si se buscaron todos (si el tope cortó, no se resuelve lo que no se miró).
  if (searched === old.length) await syncFindings(tenantId, projectId, NAP_SOURCE, found, ['seo.old_nap_found']);
  if (searched < old.length && !found.length) return { status: 'aviso', summary: `Solo se pudieron buscar ${searched} de ${old.length} teléfonos antiguos (tope de gasto o fallo): se reintentará en la próxima pasada.` };
  return { status: found.length ? 'aviso' : 'ok', summary: found.length ? `${found.length} teléfono(s) antiguo(s) siguen publicados en otras webs.` : `${searched} teléfono(s) antiguo(s) buscados: no aparecen publicados.` };
}
