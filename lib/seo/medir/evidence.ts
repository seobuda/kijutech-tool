import 'server-only';

// SEO · Evidencia de las intervenciones (parte 8): la fecha real del cambio en la web sale del registro de cambios
// (seo_change_log), filtrado por el campo que toca cada técnica; el núcleo lo pide por la capacidad, sin leer tablas de SEO.
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoChangeLog } from '@/lib/db/schema';
import { registerInterventionEvidence } from '@/lib/core/capabilities';
import { sha1 } from '@/lib/core/crawl-extract';
import { urlVariants } from '@/lib/core/measure';

/** Campos del registro que cuentan como «el cambio» de cada técnica (vacío = no consta en el registro). */
export const FIELDS_BY_TECHNIQUE: Record<string, string[]> = {
  titulo_reescrito: ['title'],
  meta_descripcion: ['meta_description'],
  encabezados: ['h1'],
  contenido_ampliado: ['content', 'title', 'h1'],
  contenido_actualizado: ['content', 'title', 'h1'],
  contenido_duplicado: ['content', 'canonical', 'status', 'url_gone'],
  reforzar_pagina_tema: ['content', 'title', 'h1'],
  optimizar_al_alcance: ['content', 'title', 'h1', 'meta_description'],
  canonical_corregido: ['canonical'],
  indexacion_corregida: ['indexable', 'status'],
  error_servidor_corregido: ['status'],
  redireccion_corregida: ['status'],
  recuperar_pagina: ['status', 'indexable', 'content', 'title'],
  canibalizacion_resuelta: ['status', 'canonical', 'content', 'url_gone'],
  unificar_o_diferenciar: ['status', 'canonical', 'content', 'title', 'url_gone'],
  nueva_landing_servicio: ['url_new'],
  nueva_landing_zona: ['url_new'],
  nueva_pagina_tema: ['url_new'],
  contenido_nuevo: ['url_new'],
  pagina_zona: ['url_new'],
  pagina_demanda: ['url_new'],
  quitar_nofollow_interno: [],
  enlazado_interno: [],
  imagenes_alt: []
};

const hashes = (urls: string[]) => [...new Set(urls.flatMap(urlVariants).map((u) => sha1(u)))].slice(0, 500);

async function firstChange(projectId: string, urls: string[], technique: string, since: Date) {
  const fields = FIELDS_BY_TECHNIQUE[technique];
  if (!fields?.length || !urls.length) return null;
  const [row] = await db
    .select({ detectedAt: seoChangeLog.detectedAt, prev: seoChangeLog.prevObservedAt, field: seoChangeLog.field })
    .from(seoChangeLog)
    .where(and(eq(seoChangeLog.projectId, projectId), inArray(seoChangeLog.urlHash, hashes(urls)), inArray(seoChangeLog.field, fields), gte(seoChangeLog.detectedAt, since)))
    .orderBy(asc(seoChangeLog.detectedAt))
    .limit(1);
  return row ?? null;
}

let registered = false;
export function registerSeoEvidence(): void {
  if (registered) return;
  registered = true;
  registerInterventionEvidence('seo', {
    effective: async (_t, projectId, urls, technique, since) => {
      const c = await firstChange(projectId, urls, technique, since);
      if (!c) return null;
      const from = c.prev && c.prev > since ? c.prev : since;
      return { from, to: c.detectedAt, source: `registro:${c.field}` };
    },
    isDone: async (_t, projectId, urls, technique, since) => {
      if (!FIELDS_BY_TECHNIQUE[technique]?.length) return 'sin_datos';
      return (await firstChange(projectId, urls, technique, since)) ? 'hecho' : 'no_hecho';
    }
  });
}
