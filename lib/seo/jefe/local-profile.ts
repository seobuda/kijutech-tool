// SEO · Jefe SEO: perfil local del negocio y evidencias de la ficha de Google (análisis de Fable 5.2, opción C, aprobada por
// Enric el 27 nov 2026). PURO: se prueba en tests/seo-jefe-local.test.ts.
// Decisiones de Enric: en un negocio local lo básico de la ficha va SIEMPRE en el primer trimestre; la línea de reseñas solo
// si los datos dicen que va por detrás o parada; las reseñas las pide el cliente (enlace y plantilla de la agencia); las
// publicaciones de la ficha bajan de prioridad. Sin confirmar cómo atiende: el orden de antes y un aviso.
import { evidenceId, type Evidence } from '@/lib/seo/jefe/evidence';

export type LocalProfile = 'local_fisico' | 'area_servicio' | 'online' | 'sin_publico' | 'desconocido';
export const PROFILE_LABEL: Record<LocalProfile, string> = {
  local_fisico: 'atiende en un local físico (la ficha de Google es palanca principal)',
  area_servicio: 'atiende a domicilio o por zona (ficha y páginas de servicio y zona al mismo nivel)',
  online: 'solo online (la ficha de Google no aplica)',
  sin_publico: 'empresa sin atención al público (la ficha es solo imagen de marca)',
  desconocido: 'sin confirmar cómo atiende (confírmalo en el Expediente: cambia el orden del plan)'
};

/** Perfil a partir de lo confirmado: manda «cómo atiende»; si no está, una ficha confirmada indica local físico. */
export function localProfile(i: { atencion: string | null; businessType: string | null; hasGoogleProfile: boolean }): LocalProfile {
  const a = (i.atencion ?? '').toLowerCase();
  if (a === 'online') return 'online';
  if (a === 'domicilio' || a === 'ambos') return 'area_servicio';
  if (a === 'local') return 'local_fisico';
  if (i.businessType === 'Organization') return 'sin_publico';
  if (i.hasGoogleProfile) return 'local_fisico';
  return 'desconocido';
}
export const isLocal = (p: LocalProfile) => p === 'local_fisico' || p === 'area_servicio';

export type LocalSnapshot = { cid: string; title: string; category: string | null; additional: number; hasHours: boolean; status: string | null; isClaimed: boolean | null; rating: number | null; votes: number | null; takenAt: string };
export type LocalReviews = { behind: boolean; medianVotes: number | null; medianRating: number | null; stalled: boolean; newVotes90: number | null };
export type LocalGrid = { keyword: string; avg: number | null; top3Pct: number | null; measured: number | null; at: string; prevAvg: number | null };

const ageDays = (iso: string, now: Date) => Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 86_400_000));

/** Evidencias L: de la ficha, las reseñas, el mapa por zonas y la coherencia NAP. Lo no medido dice «sin medir», nunca 0. */
export function localEvidence(i: { profile: LocalProfile; snapshot: LocalSnapshot | null; reviews: LocalReviews | null; grids: LocalGrid[]; napOpen: number | null; now?: Date }): Evidence[] {
  const now = i.now ?? new Date();
  const out: Evidence[] = [];
  const s = i.snapshot;
  if (!s) {
    if (isLocal(i.profile)) out.push({ id: evidenceId('L', 'sin_ficha'), type: 'L', label: 'No hay ficha de Google confirmada del negocio', data: { accion: 'identificarla o reclamarla (pestaña Local)' } });
  } else {
    out.push({
      id: evidenceId('L', `ficha:${s.cid}`),
      type: 'L',
      label: `Ficha de Google: ${s.title}`,
      data: {
        reclamada: s.isClaimed == null ? 'sin medir' : s.isClaimed ? 'sí' : 'no',
        categoria: s.category ?? 'sin categoría',
        categoriasExtra: s.additional,
        horario: s.hasHours ? 'sí' : 'no',
        estado: s.status ?? 'sin medir',
        nota: s.rating ?? 'sin medir',
        resenas: s.votes ?? 'sin medir',
        fotoDias: ageDays(s.takenAt, now)
      }
    });
    const r = i.reviews;
    out.push({
      id: evidenceId('L', `resenas:${s.cid}`),
      type: 'L',
      label: 'Reseñas frente a la competencia con ficha',
      data: r
        ? { porDetras: r.behind ? 'sí' : r.medianVotes == null ? 'sin medir (menos de 3 competidores con ficha)' : 'no', medianaCompetencia: r.medianVotes ?? 'sin medir', notaMediana: r.medianRating ?? 'sin medir', paradas: r.stalled ? 'sí' : 'no', nuevas90dias: r.newVotes90 ?? 'sin medir' }
        : { porDetras: 'sin medir' }
    });
  }
  for (const g of i.grids.slice(0, 3))
    out.push({
      id: evidenceId('L', `mapa:${g.keyword}`),
      type: 'L',
      label: `Mapa por zonas: ${g.keyword}`,
      data: { puestoMedio: g.avg ?? 'sin medir', top3Pct: g.top3Pct ?? 'sin medir', puntos: g.measured ?? 'sin medir', puestoMedioAnterior: g.prevAvg ?? 'sin medir', dias: ageDays(g.at, now) }
    });
  if (s || isLocal(i.profile)) out.push({ id: evidenceId('L', 'nap'), type: 'L', label: 'Nombre, dirección y teléfono entre web y ficha', data: { incoherencias: i.napOpen == null ? 'sin medir' : i.napOpen, estado: i.napOpen === 0 ? 'coherente' : i.napOpen == null ? 'sin medir' : 'con diferencias' } });
  return out;
}

/** Señal local que sale de las evidencias L: (para el puntuador). */
export function localSignal(evidence: Iterable<Evidence>): { signal: number; reviewsNeedWork: boolean; basicsMissing: boolean } {
  let signal = 0;
  let reviewsNeedWork = false;
  let basicsMissing = false;
  for (const e of evidence) {
    if (e.type !== 'L') continue;
    const d = e.data;
    if (e.id === 'L:sin_ficha') {
      signal += 3;
      basicsMissing = true;
    } else if (e.id.startsWith('L:ficha:')) {
      if (d.reclamada === 'no') {
        signal += 3;
        basicsMissing = true;
      }
      if (d.horario === 'no' || d.categoria === 'sin categoría' || d.categoriasExtra === 0) {
        signal += 1;
        basicsMissing = true;
      }
    } else if (e.id.startsWith('L:resenas:')) {
      if (d.porDetras === 'sí') {
        signal += 2;
        reviewsNeedWork = true;
      }
      if (d.paradas === 'sí') {
        signal += 1;
        reviewsNeedWork = true;
      }
    } else if (e.id.startsWith('L:mapa:')) {
      if (typeof d.top3Pct === 'number' && d.top3Pct < 30) signal += 2;
    } else if (e.id === 'L:nap') {
      if (typeof d.incoherencias === 'number' && d.incoherencias > 0) signal += 1;
    }
  }
  return { signal, reviewsNeedWork, basicsMissing };
}
