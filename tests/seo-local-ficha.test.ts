// SEO parte 5a · ficha de Google (26 nov 2026; docs/DISENO-SEO-LOCAL.md): identificar la ficha, cambios frente a lo
// confirmado, reseñas frente a la competencia (con mínimos) y normalización de la respuesta de DataForSEO.
import { describe, expect, it } from 'vitest';
import { changedFields, cidFromInput, fichaFindings, matchesClient, reviewsBehind, reviewsStalled, writeReviewLink } from '@/lib/seo/local/ficha-rules';
import { normalizeBusinessInfo } from '@/lib/agentes/integrations';
import { FICHA_KINDS, SALUD_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';

describe('local: identificar la ficha', () => {
  it('saca el cid de un enlace de Maps, de la forma 0x…:0x… o pegado tal cual', () => {
    expect(cidFromInput('https://maps.google.com/?cid=12345678901234567890')).toBe('12345678901234567890');
    expect(cidFromInput('https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x12a4a2c:0x1f')).toBe('31');
    expect(cidFromInput('98765432101')).toBe('98765432101');
    expect(cidFromInput('https://www.google.com/maps/search/fontanero')).toBeNull();
  });

  it('coincide por dominio o por teléfono normalizado', () => {
    expect(matchesClient({ domain: 'www.cm-iberica.net', phone: null }, { domains: ['cm-iberica.net'], phones: [] })).toBe(true);
    expect(matchesClient({ domain: 'facebook.com', phone: '+34 931 23 45 67' }, { domains: ['cm-iberica.net'], phones: ['931234567'] })).toBe(true);
    expect(matchesClient({ domain: 'otra.com', phone: '600000000' }, { domains: ['cm-iberica.net'], phones: ['931234567'] })).toBe(false);
  });
});

describe('local: cambios frente a lo confirmado', () => {
  const base = { title: 'CM Ibérica', category: 'Empresa de reformas', phone: '931234567', domain: 'cm-iberica.net', hours: { monday: '08:00-18:00' } };
  it('detecta nombre, categoría, teléfono, web y horario (por franjas), ignorando mayúsculas y prefijos', () => {
    expect(changedFields(base, { ...base, title: 'cm ibérica', phone: '+34 931 23 45 67', domain: 'www.cm-iberica.net' })).toEqual([]);
    expect(changedFields(base, { ...base, category: 'Interiorista', hours: { monday: '09:00-18:00' } })).toEqual(['category', 'hours']);
  });

  it('los hallazgos: cerrada solo si está confirmada', () => {
    const f = fichaFindings({ cid: '1', url: null, closedConfirmed: null, changed: ['category'], base, cur: { ...base, category: 'X' }, behind: { behind: false, medianVotes: null, medianRating: null }, client: { rating: 4.8, votes: 50, takenAt: '' }, stalled: false });
    expect(f.map((x) => x.kind)).toEqual(['seo.gbp_changed']);
    expect(f[0].evidence).toMatchObject({ fields: ['categoría principal'] });
  });
});

describe('local: reseñas', () => {
  it('por detrás solo con 3+ competidores y mínimos', () => {
    const comps = [
      { rating: 4.8, votes: 120, takenAt: '' },
      { rating: 4.6, votes: 80, takenAt: '' },
      { rating: 4.9, votes: 200, takenAt: '' }
    ];
    expect(reviewsBehind({ rating: 4.9, votes: 30, takenAt: '' }, comps).behind).toBe(true); // menos de la mitad de la mediana (120)
    expect(reviewsBehind({ rating: 4.4, votes: 100, takenAt: '' }, comps).behind).toBe(true); // nota 0,4 por debajo
    expect(reviewsBehind({ rating: 4.8, votes: 100, takenAt: '' }, comps).behind).toBe(false);
    expect(reviewsBehind({ rating: 3, votes: 2, takenAt: '' }, comps.slice(0, 2)).behind).toBe(false); // pocos competidores
  });

  it('paradas: 3+ fotos que cubran 60 días sin subir', () => {
    const d = (days: number) => new Date(Date.UTC(2026, 10, 26) - days * 86_400_000).toISOString();
    expect(reviewsStalled([{ rating: 4.5, votes: 40, takenAt: d(0) }, { rating: 4.5, votes: 41, takenAt: d(30) }, { rating: 4.5, votes: 40, takenAt: d(65) }])).toBe(true);
    expect(reviewsStalled([{ rating: 4.5, votes: 44, takenAt: d(0) }, { rating: 4.5, votes: 41, takenAt: d(30) }, { rating: 4.5, votes: 40, takenAt: d(65) }])).toBe(false);
    expect(reviewsStalled([{ rating: 4.5, votes: 40, takenAt: d(0) }, { rating: 4.5, votes: 40, takenAt: d(30) }])).toBe(false);
  });

  it('enlace para escribir una reseña', () => {
    expect(writeReviewLink('ChIJ123')).toBe('https://search.google.com/local/writereview?placeid=ChIJ123');
  });
});

describe('local: respuesta de DataForSEO y tipos', () => {
  it('normaliza la ficha: estado, horario por franjas, dominio', () => {
    const i = normalizeBusinessInfo({
      title: 'CM Ibérica',
      category: 'Empresa de reformas',
      cid: '123',
      place_id: 'ChIJ',
      url: 'https://www.cm-iberica.net/',
      rating: { value: 4.8, votes_count: 52 },
      work_time: { work_hours: { timetable: { tuesday: [{ open: { hour: 8, minute: 0 }, close: { hour: 18, minute: 30 } }], monday: [{ open: { hour: 8, minute: 0 }, close: { hour: 18, minute: 0 } }] }, current_status: 'temporarily_closed' } }
    });
    expect(i).toMatchObject({ cid: '123', domain: 'cm-iberica.net', rating: 4.8, votes: 52, status: 'cerrada_temporal', hours: { monday: '08:00-18:00', tuesday: '08:00-18:30' } });
    expect(normalizeBusinessInfo(null)).toBeNull();
  });

  it('los tipos de la ficha no están en la lista de la auditoría y tienen técnica', () => {
    const salud = new Set(SALUD_KINDS.map((k) => k.kind));
    for (const k of FICHA_KINDS) {
      expect(salud.has(k.kind)).toBe(false);
      expect(KIND_TECHNIQUE[k.kind], k.kind).toBeTruthy();
    }
  });
});
