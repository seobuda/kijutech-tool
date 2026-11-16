// 16-17 nov 2026: con Sonnet 5.5 la respuesta empieza con un bloque `thinking` y el adaptador leía solo el primero,
// así que «crear encargo» por Telegram recibía un texto vacío. Sin red ni base de datos.
import { describe, expect, it } from 'vitest';
import { anthropicText } from '@/lib/ai/adapters/anthropic';

describe('adaptador de Anthropic: texto de la respuesta', () => {
  it('salta los bloques de pensamiento y une todos los de texto', () => {
    expect(
      anthropicText({
        content: [{ type: 'thinking', text: undefined }, { type: 'text', text: '{"encargos":' }, { type: 'text', text: '[]}' }],
        stop_reason: 'end_turn'
      })
    ).toBe('{"encargos":[]}');
  });

  it('sigue funcionando con una respuesta sin pensamiento', () => {
    expect(anthropicText({ content: [{ type: 'text', text: 'hola' }], stop_reason: 'end_turn' })).toBe('hola');
  });

  it('sin texto lanza un error con el motivo (así queda como fallo en ai_jobs)', () => {
    expect(() => anthropicText({ content: [{ type: 'thinking' }], stop_reason: 'max_tokens' })).toThrow(/límite de tokens/);
    expect(() => anthropicText({ content: [], stop_reason: 'refusal' })).toThrow(/rechazó/);
    expect(() => anthropicText({})).toThrow(/vacía/);
  });

  it('una respuesta cortada con algo de texto se devuelve (quien llama detecta el corte)', () => {
    expect(anthropicText({ content: [{ type: 'thinking' }, { type: 'text', text: '{"a":' }], stop_reason: 'max_tokens' })).toBe('{"a":');
  });
});
