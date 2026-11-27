// SEO parte 11 · panel de IA mensual (27 nov 2026; docs/DISENO-SEO-CIERRE.md §A): preguntas por plantilla, detección
// de citas y nombres sin IA, recorte y aviso con margen.
import { describe, expect, it } from 'vitest';
import { brandPhrases, distinctiveNames, domainCited, excerpt, lostToCompetitionMonths, lostToCompetitionState, otherSources, presenceShare, proposeQuestions, readAnswer, sampleOfDay, textNames } from '@/lib/seo/panel-ia/rules';
import { readAiResult } from '@/lib/agentes/integrations';

describe('panel de IA: preguntas', () => {
  it('servicio × población, sin repetir lo que ya hay y como mucho el máximo', () => {
    const q = proposeQuestions({ services: ['Taller de motos', 'ITV de motos'], zona: 'Sabadell, Terrassa y Barcelona', topics: ['reparación de scooters'], existing: ['¿Cuál es la mejor empresa de taller de motos en Sabadell?'] });
    expect(q).not.toContain('¿Cuál es la mejor empresa de taller de motos en Sabadell?');
    expect(q).toContain('Recomiéndame taller de motos en Terrassa');
    expect(q).toContain('¿Cuál es la mejor empresa de itv de motos en Sabadell?');
    expect(q.some((x) => x.includes('reparación de scooters'))).toBe(true);
    expect(proposeQuestions({ services: Array.from({ length: 10 }, (_, i) => `servicio ${i}`), zona: 'Sabadell, Terrassa, Rubí', topics: [], existing: [] }, 5)).toHaveLength(5);
  });
  it('sin zona, pregunta sin población', () => {
    expect(proposeQuestions({ services: ['reformas'], zona: null, topics: [], existing: [] })).toEqual(['¿Qué empresa de reformas me recomiendas?']);
  });
});

describe('panel de IA: detección', () => {
  it('nombrado solo con el nombre completo, no con una palabra genérica', () => {
    const p = brandPhrases(['Centros DYM']);
    expect(textNames('Te recomiendo varios centros de estética en Sabadell.', p)).toBe(false);
    expect(textNames('Destacan Centros DYM y Clínica Sol.', p)).toBe(true);
    expect(textNames('Destacan CentrosDYM.', p)).toBe(true);
    expect(textNames('Ver «CM Ibérica, S.L.» en Barcelona', brandPhrases(['CM Iberica SL']))).toBe(true);
  });
  it('citado por dominio exacto o subdominio, no por parecido', () => {
    expect(domainCited(['https://www.cm-iberica.com/servicios'], 'cm-iberica.com')).toBe(true);
    expect(domainCited(['blog.cm-iberica.com'], 'https://cm-iberica.com')).toBe(true);
    expect(domainCited(['https://notcm-iberica.com'], 'cm-iberica.com')).toBe(false);
  });
  it('lee cliente y competencia', () => {
    const r = readAnswer(
      { text: 'Las mejores opciones son Motos Pérez y Taller Rius.', sources: ['https://motosperez.es/a', 'https://www.google.com/maps'], brands: [] },
      { domain: 'tallerrius.com', names: ['Taller Rius'] },
      [{ domain: 'motosperez.es', name: 'Motos Pérez' }, { domain: 'otro.es', name: 'Otro Taller Grande' }]
    );
    expect(r.clientCited).toBe(false);
    expect(r.clientNamed).toBe(true);
    expect(r.competitors).toEqual([{ domain: 'motosperez.es', name: 'Motos Pérez', cited: true, named: true }]);
    expect(r.sources).toEqual(['motosperez.es', 'google.com']);
  });
});

describe('panel de IA: auditoría (nombres genéricos, directorios, muestras, cuota)', () => {
  it('un nombre que solo repite la pregunta no cuenta; el dominio sí', () => {
    expect(distinctiveNames(['Fontanería Sabadell'], '¿Cuál es la mejor fontanería en Sabadell?')).toEqual([]);
    expect(distinctiveNames(['Fontanería Puig'], '¿Cuál es la mejor fontanería en Sabadell?')).toEqual(['Fontanería Puig']);
    const r = readAnswer({ text: 'La mejor fontanería en Sabadell es...', sources: [] }, { domain: 'fontaneriasabadell.com', names: ['Fontanería Sabadell'] }, [], '¿Cuál es la mejor fontanería en Sabadell?');
    expect(r.clientNamed).toBe(false);
  });
  it('directorios y redes fuera de «en su lugar»', () => {
    expect(otherSources(['doctoralia.es', 'es.wikipedia.org', 'motosperez.es', 'cliente.com', 'blog.cliente.com'], 'cliente.com')).toEqual(['motosperez.es']);
  });
  it('muestras por día y cuota de presencia', () => {
    expect([1, 10, 11, 20, 21, 31].map(sampleOfDay)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(presenceShare([{ status: 'hecha', clientCited: true, clientNamed: false }, { status: 'hecha', clientCited: false, clientNamed: false }, { status: 'fallida', clientCited: null, clientNamed: null }])).toEqual({ share: 0.5, n: 2 });
    expect(presenceShare([])).toEqual({ share: null, n: 0 });
  });
  it('aviso con dos meses de cuota 0 y competencia > 50 %', () => {
    expect(lostToCompetitionMonths([{ month: '2026-10', n: 12, clientShare: 0, competitorShare: 0.6 }, { month: '2026-11', n: 12, clientShare: 0, competitorShare: 0.75 }])).toBe(true);
    expect(lostToCompetitionMonths([{ month: '2026-10', n: 2, clientShare: 0, competitorShare: 1 }, { month: '2026-11', n: 12, clientShare: 0, competitorShare: 1 }])).toBe(false);
    expect(lostToCompetitionMonths([{ month: '2026-10', n: 12, clientShare: 0.1, competitorShare: 1 }, { month: '2026-11', n: 12, clientShare: 0, competitorShare: 1 }])).toBe(false);
  });
});

describe('panel de IA: lectura defensiva de DataForSEO', () => {
  it('saca texto, fuentes y marcas de formas distintas', () => {
    const r = readAiResult({ markdown: 'Taller Rius es bueno.', items: [{ type: 'text', text: 'Taller Rius es bueno.' }], sources: [{ domain: 'tallerrius.com', url: 'https://tallerrius.com/' }, { url: 'https://vertexaisearch.cloud.google.com/x' }], brand_entities: [{ title: 'Taller Rius' }] });
    expect(r.text).toBe('Taller Rius es bueno.');
    expect(r.sources).toEqual(['tallerrius.com', 'https://tallerrius.com/']);
    expect(r.brands).toEqual(['Taller Rius']);
  });
});

describe('panel de IA: recorte y aviso', () => {
  it('recorta alrededor del nombre', () => {
    const t = `${'x '.repeat(400)}Taller Rius es muy bueno ${'y '.repeat(400)}`;
    const e = excerpt(t, ['Taller Rius'], 200);
    expect(e).toContain('Taller Rius');
    expect(e.length).toBeLessThanOrEqual(202);
  });
  it('aviso solo con dos meses seguidos', () => {
    expect(lostToCompetitionState([{ month: '2026-11', clientAny: false, competitorAny: true }])).toBe(false);
    expect(lostToCompetitionState([{ month: '2026-10', clientAny: false, competitorAny: true }, { month: '2026-11', clientAny: false, competitorAny: true }])).toBe(true);
    expect(lostToCompetitionState([{ month: '2026-10', clientAny: true, competitorAny: true }, { month: '2026-11', clientAny: false, competitorAny: true }])).toBe(false);
  });
});
