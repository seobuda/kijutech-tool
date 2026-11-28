// Módulo Google Ads · textos de la auditoría de higiene (paso 3) que usan también las pantallas del navegador. Sin
// importaciones (los componentes de cliente no pueden cargar node:crypto, que usa rules.ts).

export const AUDIT_CONTROLS = [
  'propiedad_accesos',
  'linea_base',
  'conversiones',
  'caduca_feb_2027',
  'ai_max',
  'textos_automaticos',
  'socios_busqueda',
  'display_en_busqueda',
  'presencia_interes',
  'exclusiones_contenido',
  'zona_real',
  'lugares_fuera_zona',
  'marca_generico',
  'pmax_redes',
  'paginas_elegidas',
  'autoaplicadas',
  'recomendaciones',
  'recurso_llamada'
] as const;
export type AuditControl = (typeof AUDIT_CONTROLS)[number];
export type AuditStatus = 'bien' | 'mal' | 'no_comprobado';
export type Risk = 'R0' | 'R1' | 'R2' | 'R3';
export type FichaFact = 'marca' | 'zona' | 'telefono' | 'horario' | 'competidores' | 'sector' | 'servicios';

export const FICHA_FACTS: FichaFact[] = ['marca', 'zona', 'telefono', 'horario', 'competidores', 'sector', 'servicios'];
export const FICHA_FACT_LABEL: Record<FichaFact, string> = {
  marca: 'Marca (nombre y alias)',
  zona: 'Zona que atiende',
  telefono: 'Teléfono',
  horario: 'Horario de atención',
  competidores: 'Competidores',
  sector: 'Sector',
  servicios: 'Servicios que ofrece'
};

/** Tandas de EST-07: 0 propiedad y línea base; 1 datos y riesgo; 2 gasto recortable; 3 aprendizaje y estructura; 4 pruebas. */
export const TANDA_LABEL: Record<number, string> = {
  0: 'Tanda 0 · Propiedad, accesos y línea base',
  1: 'Tanda 1 · Datos y riesgo',
  2: 'Tanda 2 · Gasto recortable sin riesgo',
  3: 'Tanda 3 · Aprendizaje y estructura',
  4: 'Tanda 4 · Pruebas'
};

export const CONTROL_INFO: Record<AuditControl, { tanda: number; label: string; capability: string; risk: Risk }> = {
  propiedad_accesos: { tanda: 0, label: 'Propiedad y accesos', capability: 'EST-07', risk: 'R0' },
  linea_base: { tanda: 0, label: 'Línea base congelada de 90 días', capability: 'EST-07', risk: 'R0' },
  conversiones: { tanda: 1, label: 'Conversiones de entrada', capability: 'EST-01', risk: 'R3' },
  caduca_feb_2027: { tanda: 1, label: 'Lo que caduca en febrero de 2027', capability: 'Calendario 9.5', risk: 'R2' },
  ai_max: { tanda: 1, label: 'AI Max y migraciones de Google', capability: 'GOO-03', risk: 'R2' },
  textos_automaticos: { tanda: 1, label: 'Textos e imágenes automáticos', capability: 'EST-01 · GOO-03', risk: 'R1' },
  socios_busqueda: { tanda: 2, label: 'Socios de búsqueda', capability: 'EST-01', risk: 'R2' },
  display_en_busqueda: { tanda: 2, label: 'Display dentro de Búsqueda', capability: 'EST-01', risk: 'R2' },
  presencia_interes: { tanda: 2, label: '«Presencia o interés» en negocio local', capability: 'EST-01', risk: 'R2' },
  exclusiones_contenido: { tanda: 2, label: 'Exclusiones de contenido y aplicaciones', capability: 'EST-01', risk: 'R1' },
  zona_real: { tanda: 2, label: 'Zona real del negocio', capability: 'EST-02', risk: 'R2' },
  lugares_fuera_zona: { tanda: 2, label: 'Términos con lugares fuera de la zona', capability: 'TER-04', risk: 'R1' },
  marca_generico: { tanda: 2, label: 'Marca, genérico y competencia', capability: 'TER-11 · EST-04', risk: 'R2' },
  pmax_redes: { tanda: 2, label: 'Redes de Performance Max', capability: 'GOO-01', risk: 'R2' },
  paginas_elegidas: { tanda: 2, label: 'Páginas elegidas por Google', capability: 'LAN-06', risk: 'R2' },
  autoaplicadas: { tanda: 3, label: 'Recomendaciones que se aplican solas', capability: 'EST-01 · EST-06', risk: 'R1' },
  recomendaciones: { tanda: 3, label: 'Recomendaciones de Google, cribadas', capability: 'GOO-06', risk: 'R1' },
  recurso_llamada: { tanda: 3, label: 'Recurso de llamada', capability: 'LLA-02', risk: 'R1' }
};

export const AUDIT_RESPONSES = ['hecho', 'cliente_lo_quiere', 'no_aplica', 'mas_tarde'] as const;
export type AuditResponse = (typeof AUDIT_RESPONSES)[number];
export const AUDIT_RESPONSE_LABEL: Record<AuditResponse, string> = {
  hecho: 'Hecho (corregido a mano en Google Ads)',
  cliente_lo_quiere: 'El cliente lo quiere así',
  no_aplica: 'No aplica a esta cuenta',
  mas_tarde: 'Más tarde'
};
/** Respuestas que piden motivo (son una «no-acción» registrada, APR-01). */
export const AUDIT_RESPONSE_NEEDS_REASON: AuditResponse[] = ['cliente_lo_quiere', 'no_aplica'];

export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = { bien: 'bien', mal: 'mal', no_comprobado: 'no comprobado' };
