// Módulo Estrategia, fase 2 (16 nov 2026): reglas puras del estratega. Limpieza de la respuesta de la IA, evidencia
// contra el expediente, duplicados, horas del equipo, prioridad ICE, recorte a las horas que quedan, botones de
// Telegram (límite de 64 bytes) y estadísticas de calidad. Sin base de datos, red ni IA.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRATEGIST,
  analysisKeyboard,
  analysisMessage,
  cleanStrategistOutput,
  cleanStrategistSettings,
  estimateHours,
  evidenceIsValid,
  fitToHours,
  iceScore,
  isDuplicate,
  normUrl,
  qualityStats,
  reasonKeyboard,
  titleSimilarity,
  validEvidence,
  type EvidenceRefs
} from '@/lib/estrategia/strategist-rules';

const ID = '123e4567-e89b-12d3-a456-426614174000';

const refs = (): EvidenceRefs => ({
  urls: new Set([normUrl('https://www.ejemplo.com/servicios/')]),
  queries: new Set(['dentista valencia']),
  signals: new Set(['S1', 'S2']),
  objectives: new Set(['O1']),
  keywords: new Set(['clinica dental valencia']),
  kpis: new Set(['gsc_clicks', 'clics'])
});

describe('estratega: ajustes', () => {
  it('rellena lo que falta y recorta a los rangos', () => {
    expect(cleanStrategistSettings(null)).toEqual(DEFAULT_STRATEGIST);
    expect(cleanStrategistSettings({ maxSuggestions: 50, alertsPerMonth: -3, expireDays: '10', snoozeDays: 'x' })).toEqual({ maxSuggestions: 10, alertsPerMonth: 0, expireDays: 10, snoozeDays: 30 });
  });
});

describe('estratega: respuesta de la IA', () => {
  it('normaliza tipos, rangos y categorías, y quita lo que no tiene título o descripción', () => {
    const out = cleanStrategistOutput(
      {
        resumen: '  Va bien  ',
        diagnostico: ['a', 3, null],
        propuestas: [
          { titulo: 'Reescribir el title de servicios', descripcion: 'El CTR está muy por debajo de lo esperado para la posición.', categoria: 'ONPAGE', impacto: 15, confianza: '7', horas: '1.3', evidencia: [{ tipo: 'URL', ref: 'https://ejemplo.com/servicios' }, { tipo: 'x' }], efecto_esperado: { metrica: 'ctr', cambio_pct: '20' } },
          { titulo: 'Corto', descripcion: 'x' },
          'basura'
        ]
      },
      5
    );
    expect(out.summary).toBe('Va bien');
    expect(out.diagnosis).toEqual(['a', '3']);
    expect(out.proposals).toHaveLength(1);
    const p = out.proposals[0];
    expect(p).toMatchObject({ category: 'onpage', impact: 10, confidence: 7, hours: 1.5, expected: { metrica: 'ctr', cambio_pct: 20 } });
    expect(p.evidence).toEqual([{ tipo: 'url', ref: 'https://ejemplo.com/servicios', periodo: '', dato: '' }]);
  });

  it('una categoría desconocida pasa a «otro» y no acepta más del doble del máximo', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ titulo: `Propuesta número ${i}`, descripcion: 'Descripción suficientemente larga.', categoria: 'magia' }));
    const out = cleanStrategistOutput({ propuestas: many }, 3);
    expect(out.proposals).toHaveLength(6);
    expect(out.proposals[0].category).toBe('otro');
    expect(cleanStrategistOutput('no es json', 5).proposals).toEqual([]);
  });
});

describe('estratega: evidencia', () => {
  it('solo vale lo que está en el expediente (URL sin www ni barra final, consultas, códigos)', () => {
    const r = refs();
    expect(evidenceIsValid({ tipo: 'url', ref: 'https://ejemplo.com/servicios', periodo: '', dato: '' }, r)).toBe(true);
    expect(evidenceIsValid({ tipo: 'url', ref: 'https://ejemplo.com/inventada', periodo: '', dato: '' }, r)).toBe(false);
    expect(evidenceIsValid({ tipo: 'consulta', ref: '  Dentista   Valencia ', periodo: '', dato: '' }, r)).toBe(true);
    expect(evidenceIsValid({ tipo: 'palabra', ref: 'dentista valencia', periodo: '', dato: '' }, r)).toBe(true);
    expect(evidenceIsValid({ tipo: 'señal', ref: '[s2]', periodo: '', dato: '' }, r)).toBe(true);
    expect(evidenceIsValid({ tipo: 'senal', ref: 'S9', periodo: '', dato: '' }, r)).toBe(false);
    expect(evidenceIsValid({ tipo: 'objetivo', ref: 'o1', periodo: '', dato: '' }, r)).toBe(true);
    expect(evidenceIsValid({ tipo: 'kpi', ref: 'Clics', periodo: '', dato: '' }, r)).toBe(true);
    expect(evidenceIsValid({ tipo: 'otra', ref: 'S1', periodo: '', dato: '' }, r)).toBe(true);
    expect(evidenceIsValid({ tipo: 'otra', ref: 'algo inventado', periodo: '', dato: '' }, r)).toBe(false);
  });

  it('una propuesta sin evidencia válida se queda sin evidencia', () => {
    const [p] = cleanStrategistOutput({ propuestas: [{ titulo: 'Crear página nueva', descripcion: 'Porque sí, sin ningún dato detrás.', evidencia: [{ tipo: 'url', ref: 'https://otra.com' }] }] }, 5).proposals;
    expect(validEvidence(p, refs())).toEqual([]);
  });
});

describe('estratega: duplicados', () => {
  it('detecta títulos parecidos ignorando tildes y palabras vacías', () => {
    expect(titleSimilarity('Optimizar el title de la página de implantes', 'Title página implantes')).toBe(1);
    expect(isDuplicate('Reescribir la meta descripción de Implantes', ['Revisar meta descripcion implantes dentales'])).toBeTruthy();
    expect(isDuplicate('Crear artículo sobre ortodoncia invisible', ['Mejorar velocidad de la home'])).toBeNull();
    expect(titleSimilarity('de la el', 'algo')).toBe(0);
  });
});

describe('estratega: horas, prioridad y recorte', () => {
  it('usa lo que tarda el equipo si hay al menos 3 casos; si no, lo que dice la IA', () => {
    const effort = { articulo: { medianMinutes: 150, n: 5 }, onpage: { medianMinutes: 40, n: 2 } };
    expect(estimateHours({ hours: 4, workType: 'articulo' }, effort)).toEqual({ hours: 2.5, source: 'equipo' });
    expect(estimateHours({ hours: 4, workType: 'onpage' }, effort)).toEqual({ hours: 4, source: 'ia' });
    expect(estimateHours({ hours: 1, workType: '' }, effort)).toEqual({ hours: 1, source: 'ia' });
  });

  it('ICE = impacto × confianza / horas (como mínimo media hora)', () => {
    expect(iceScore(8, 5, 2)).toBe(20);
    expect(iceScore(8, 5, 0.1)).toBe(80);
  });

  it('ordena por ICE, respeta el máximo y las horas que quedan', () => {
    const list = [
      { title: 'a', hours: 3, ice: 10 },
      { title: 'b', hours: 1, ice: 30 },
      { title: 'c', hours: 2, ice: 20 },
      { title: 'd', hours: 0.5, ice: 5 }
    ];
    const r = fitToHours(list, 3.5, 5);
    expect(r.keep.map((x) => x.title)).toEqual(['b', 'c', 'd']);
    expect(r.cut.map((x) => x.title)).toEqual(['a']);
    expect(fitToHours(list, null, 2).keep.map((x) => x.title)).toEqual(['b', 'c']);
  });

  it('si no cabe ninguna, se queda la mejor marcada como fuera de horas', () => {
    const r = fitToHours([{ title: 'a', hours: 5, ice: 3 }, { title: 'b', hours: 4, ice: 9 }], 1, 5);
    expect(r.keep).toEqual([{ title: 'b', hours: 4, ice: 9, overHours: true }]);
    expect(r.cut.map((x) => x.title)).toEqual(['a']);
  });
});

describe('estratega: Telegram', () => {
  it('los datos de cada botón caben en 64 bytes y siguen el patrón x:est', () => {
    const rows = [...analysisKeyboard([{ id: ID, rank: 2 }, { id: ID, rank: 1 }]), ...reasonKeyboard(ID, 1)];
    for (const b of rows.flat()) {
      expect(Buffer.byteLength(b.data)).toBeLessThanOrEqual(64);
      expect(b.data).toMatch(/^x:est:(ok|aj|pa|no|bk|r:(yh|ne|pi|sh|ot)):[0-9a-f-]{36}$/);
    }
    expect(analysisKeyboard([{ id: ID, rank: 2 }, { id: ID, rank: 1 }])[0][0].text).toContain('1');
  });

  it('el mensaje escapa el HTML y no pasa del límite de Telegram', () => {
    const long = 'x'.repeat(2000);
    const html = analysisMessage({
      clientName: 'A & <B>',
      trigger: 'alerta',
      reason: 'caída',
      summary: long,
      link: null,
      suggestions: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, title: `<t${i}>`, description: long, impact: 5, confidence: 5, hours: 1.5, hoursSource: 'equipo', evidence: [{ dato: '<d>', ref: 'S1' }], overHours: i === 0 }))
    });
    expect(html).toContain('A &amp; &lt;B&gt;');
    expect(html).not.toContain('<t0>');
    expect(html.length).toBeLessThanOrEqual(3900);
    expect(analysisMessage({ clientName: 'C', trigger: 'programado', reason: null, summary: 'ok', suggestions: [], link: null })).toContain('No propone tareas nuevas');
  });
});

describe('estratega: calidad', () => {
  it('aceptación sin contar aplazadas; ejecución solo de encargos con más de 3 semanas', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const old = new Date('2026-10-01T12:00:00Z');
    const recent = new Date('2026-11-14T12:00:00Z');
    const s = qualityStats(
      [
        { status: 'aprobada', rejectReason: null, executedAt: old, decidedAt: old, createdAt: old },
        { status: 'ajustada', rejectReason: null, executedAt: null, decidedAt: old, createdAt: old },
        { status: 'aprobada', rejectReason: null, executedAt: null, decidedAt: recent, createdAt: recent },
        { status: 'rechazada', rejectReason: 'ya_hecho', executedAt: null, decidedAt: recent, createdAt: recent },
        { status: 'rechazada', rejectReason: null, executedAt: null, decidedAt: recent, createdAt: recent },
        { status: 'aplazada', rejectReason: null, executedAt: null, decidedAt: recent, createdAt: recent },
        { status: 'pendiente', rejectReason: null, executedAt: null, decidedAt: null, createdAt: recent }
      ],
      now
    );
    expect(s).toMatchObject({ total: 7, pending: 1, accepted: 3, adjusted: 1, rejected: 2, snoozed: 1, executedOld: 1, oldAccepted: 2, reasons: { ya_hecho: 1, otro: 1 } });
    expect(s.acceptanceRate).toBeCloseTo(0.6);
    expect(s.executionRate).toBe(0.5);
    expect(qualityStats([], now)).toMatchObject({ acceptanceRate: null, executionRate: null });
  });
});
