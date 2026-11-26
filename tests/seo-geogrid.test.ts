// SEO parte 5b · geo-grid (27 nov 2026; docs/DISENO-SEO-GEOGRID.md): cuadrícula y coordenadas, puesto por cid, resumen y
// caída comparable, nombres sospechosos (2 señales), búsquedas sin población, franja horaria y respuesta de Maps.
import { describe, expect, it } from 'vitest';
import { clientRank, comparable, coordinate, gridDrop, gridParams, gridPoints, inSendWindow, nextSendWindow, stripTowns, summarize, suspiciousName } from '@/lib/seo/local/geogrid-rules';
import { summarizeMapsItems } from '@/lib/agentes/integrations';
import { GEOGRID_KINDS, SALUD_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';

describe('geo-grid: cuadrícula', () => {
  it('5×5 centrada, norte arriba, longitud corregida por la latitud', () => {
    const pts = gridPoints(41.5, 2.1, 0.5);
    expect(pts).toHaveLength(25);
    const center = pts.find((p) => p.row === 2 && p.col === 2)!;
    expect(center).toMatchObject({ lat: 41.5, lng: 2.1 });
    const north = pts.find((p) => p.row === 0 && p.col === 2)!;
    expect(north.lat).toBeCloseTo(41.5 + 1 / 111.32, 6);
    const east = pts.find((p) => p.row === 2 && p.col === 3)!;
    expect(east.lng - 2.1).toBeCloseTo(0.5 / (111.32 * Math.cos((41.5 * Math.PI) / 180)), 6);
    expect(coordinate(41.123456789, 2.1, 14)).toBe('41.1234568,2.1,14z');
  });

  it('paso y zoom por cómo atiende; online sin cuadrícula', () => {
    expect(gridParams('local')).toEqual({ stepKm: 0.5, zoom: 14 });
    expect(gridParams('domicilio')).toEqual({ stepKm: 1.5, zoom: 13 });
    expect(gridParams(null)).toEqual({ stepKm: 0.5, zoom: 14 });
    expect(gridParams('online')).toBeNull();
  });
});

describe('geo-grid: medición', () => {
  it('puesto del cliente solo por cid o place_id, sin anuncios', () => {
    const items = summarizeMapsItems([
      { type: 'maps_paid_item', title: 'Anuncio', rank_group: 1 },
      { type: 'maps_search', title: 'Otro', rank_group: 1, cid: '1' },
      { type: 'maps_search', title: 'CM Ibérica', rank_group: 2, cid: '99', place_id: 'P' }
    ]);
    expect(items.map((i) => i.title)).toEqual(['Otro', 'CM Ibérica']);
    expect(clientRank(items, '99', null)).toBe(2);
    expect(clientRank(items, 'x', 'P')).toBe(2);
    expect(clientRank(items, 'x', null)).toBeNull();
  });

  it('resumen: fuera cuenta como 21; caída solo con media 3+ peor y 8+ puntos que bajan', () => {
    expect(summarize([1, 2, null, undefined])).toEqual({ avg: 8, top3Pct: 67, measured: 3 });
    const before = Array.from({ length: 25 }, () => 2);
    const after = Array.from({ length: 25 }, (_, i) => (i < 10 ? 12 : 2)); // media 6 frente a 2, 10 puntos bajan
    expect(gridDrop(after, before)).toBe(true);
    expect(gridDrop(Array.from({ length: 25 }, (_, i) => (i < 5 ? 20 : 2)), before)).toBe(false); // solo 5 puntos
    expect(comparable({ keyword: 'a', lat: 1, lng: 1, stepKm: 0.5, zoom: 14 }, { keyword: 'a', lat: 1, lng: 1, stepKm: 1.5, zoom: 14 })).toBe(false);
  });
});

describe('geo-grid: nombres sospechosos y búsquedas', () => {
  const services = ['Fontanería', 'Desatascos'];
  const towns = ['Sabadell', 'Terrassa'];
  it('hacen falta 2 señales; el nombre que coincide con su dominio no se marca', () => {
    expect(suspiciousName('Fontanería López', 'fontanerialopez.com', services, towns).suspicious).toBe(false);
    expect(suspiciousName('Fontanería Sabadell S.L.', null, services, towns).suspicious).toBe(false); // una sola señal
    expect(suspiciousName('Fontanero Sabadell 24h Urgente - Desatascos Baratos - Terrassa', null, services, towns).suspicious).toBe(true);
    expect(suspiciousName('Fontanería Sabadell 24h', 'fontaneriasabadell24h.es', services, towns).suspicious).toBe(false);
  });

  it('quita las poblaciones de la búsqueda', () => {
    expect(stripTowns('reformas de oficinas en Sabadell', towns)).toBe('reformas de oficinas');
    expect(stripTowns('fontanero terrassa', towns)).toBe('fontanero');
  });

  it('franja de envío: laborables de 10 a 12 en Madrid', () => {
    expect(inSendWindow(new Date('2026-11-27T10:30:00Z'))).toBe(true); // viernes 11:30 en Madrid (UTC+1)
    expect(inSendWindow(new Date('2026-11-28T10:30:00Z'))).toBe(false); // sábado
    expect(inSendWindow(new Date('2026-11-27T20:00:00Z'))).toBe(false);
    expect(inSendWindow(nextSendWindow(new Date('2026-11-27T20:00:00Z')))).toBe(true);
  });

  it('los tipos del mapa por zonas no están en la lista de la auditoría y tienen técnica', () => {
    const salud = new Set(SALUD_KINDS.map((k) => k.kind));
    for (const k of GEOGRID_KINDS) {
      expect(salud.has(k.kind)).toBe(false);
      expect(KIND_TECHNIQUE[k.kind], k.kind).toBeTruthy();
    }
  });
});
