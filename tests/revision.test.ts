// Arreglos de la revisión completa del 17 nov 2026 que se pueden probar sin servicios externos.
import { describe, expect, it } from 'vitest';
import { parseUserDate } from '@/lib/operaciones/cleanup';
import { fetchPublic, isPublicUrl } from '@/lib/core/net';
import { isPublicUrl as estrategiaIsPublicUrl } from '@/lib/estrategia/web';
import { anthropicText } from '@/lib/ai/adapters/anthropic';

describe('revisión 17 nov: fechas escritas en la limpieza', () => {
  it('sin año y ya pasada, es del año siguiente (cambio de año)', () => {
    const dec28 = Date.parse('2026-12-28T12:00:00Z');
    expect(parseUserDate('5/1', dec28)).toEqual({ ok: true, ymd: '2027-01-05' });
    expect(parseUserDate('30/12', dec28)).toEqual({ ok: true, ymd: '2026-12-30' });
    // Con el año escrito no se toca: una fecha pasada sigue siendo pasada.
    expect(parseUserDate('5/1/2026', dec28).ok).toBe(false);
  });
});

describe('revisión 17 nov: SSRF (núcleo, compartido por Estrategia y SEO)', () => {
  it('rechaza direcciones internas antes de pedir nada', async () => {
    for (const u of ['http://127.0.0.1:3000/', 'http://169.254.169.254/latest/meta-data', 'http://localhost/', 'http://10.0.0.5/', 'file:///etc/passwd', 'http://kijutech_db:5432/']) {
      expect(isPublicUrl(u), u).toBe(false);
      const r = await fetchPublic(u);
      expect('error' in r, u).toBe(true);
    }
    expect(isPublicUrl('https://www.kijutech.com/')).toBe(true);
    expect(estrategiaIsPublicUrl).toBe(isPublicUrl);
  });
});

describe('revisión 17 nov: respuestas de Claude con pensamiento', () => {
  it('el texto viene después de los bloques de pensamiento', () => {
    expect(anthropicText({ content: [{ type: 'thinking' }, { type: 'text', text: 'ok' }], stop_reason: 'end_turn' })).toBe('ok');
  });
});
