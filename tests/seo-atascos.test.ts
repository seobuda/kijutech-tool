// Atascos de la simulación (27 nov): tipo de trabajo por técnica y el brief como texto para el encargo.
import { describe, expect, it } from 'vitest';
import { techniqueWorkType } from '@/lib/seo/plan/rules';
import { keywordLocation } from '@/lib/seo/posiciones/rules';
import { briefToText } from '@/lib/seo/contenido/brief-text';

describe('tipo de trabajo del encargo', () => {
  it('páginas nuevas, redacción y cambios web', () => {
    expect(techniqueWorkType('pagina_demanda')).toBe('landing');
    expect(techniqueWorkType('contenido_actualizado')).toBe('articulo');
    expect(techniqueWorkType('titulo_reescrito')).toBe('cambio_web');
  });
});

describe('brief como texto', () => {
  it('lleva lo que falta, subtemas, datos del cliente y enlaces, sin líneas vacías dobles', () => {
    const t = briefToText('reforma cocina sabadell', {
      intent: 'transaccional',
      words: 900,
      target: 'https://w.es/cocinas',
      score: { missing: ['Precio'], queryInTitle: false, queryInH1: true, wordsLow: false },
      subtopics: [{ label: 'Precio', sites: 3 }],
      client: { zona: 'Sabadell', servicios: ['cocinas', 'baños'] },
      links: [{ from: 'https://w.es/blog/x', anchor: 'reforma de cocina' }]
    });
    expect(t).toContain('BRIEF: reforma cocina sabadell');
    expect(t).toContain('- La búsqueda en el título');
    expect(t).toContain('- Subtema: Precio');
    expect(t).toContain('- servicios: cocinas, baños');
    expect(t).toContain('«reforma de cocina»');
    expect(t).not.toMatch(/\n\n\n/);
  });
});

describe('ubicación por búsqueda', () => {
  const list = [
    { name: 'Sabadell,Catalonia,Spain', type: 'City' },
    { name: 'Terrassa,Catalonia,Spain', type: 'City' },
    { name: 'Barcelona,Catalonia,Spain', type: 'Province' }
  ];
  it('la población de la búsqueda si está como ciudad; si no, la del proyecto', () => {
    expect(keywordLocation('reformas cocina terrassa', ['Sabadell', 'Terrassa'], list, 'Sabadell,Catalonia,Spain')).toBe('Terrassa,Catalonia,Spain');
    expect(keywordLocation('reformas cocina', ['Sabadell', 'Terrassa'], list, 'Sabadell,Catalonia,Spain')).toBe('Sabadell,Catalonia,Spain');
    expect(keywordLocation('reformas sant cugat', ['Sant Cugat'], list, 'Sabadell,Catalonia,Spain')).toBe('Sabadell,Catalonia,Spain');
  });
});
