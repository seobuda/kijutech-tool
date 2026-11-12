// Agente de correo como project manager (12 nov 2026): hilo sin texto citado, frase verídica del encargo,
// medidas de calidad (preguntas y promesas) y botones nuevos de Telegram. Sin base de datos.
import { describe, expect, it } from 'vitest';
import { createdSentence, normalizeSubject, stripQuoted, withSentence } from '@/lib/operaciones/email-pm';
import { endsWithQuestion, promisesAction } from '@/lib/operaciones/agent-actions';
import { AGENT_CALLBACK_RE } from '@/lib/operaciones/telegram-handler';

describe('texto citado y asuntos', () => {
  it('quita lo citado en español, inglés y con «>»', () => {
    expect(stripQuoted('Vale, Home y Contacto.\n\nEl jue, 12 nov 2026 a las 0:18, Equipo (<a@b.c>) escribió:\n> Hola')).toBe(
      'Vale, Home y Contacto.'
    );
    expect(stripQuoted('Sounds good\nOn Thu, Nov 12, 2026 at 9:00 AM Team <a@b.c> wrote:\n> hi')).toBe('Sounds good');
    expect(stripQuoted('Hola\n> citado\n> más')).toBe('Hola');
    expect(stripQuoted('Sin citas')).toBe('Sin citas');
  });

  it('el asunto se compara sin «Re:», «RV:» ni «Fwd:»', () => {
    expect(normalizeSubject('Re: RE: cambio web cliente')).toBe('cambio web cliente');
    expect(normalizeSubject('RV: Fwd: Cambio Web')).toBe('cambio web');
  });
});

describe('la respuesta solo dice lo que de verdad ha pasado', () => {
  const details = [
    {
      title: 'Quitar animaciones',
      description: '',
      listId: 'L',
      listName: 'Web',
      spaceId: 'S',
      assigneeId: '7',
      assigneeName: 'Jesus M',
      assigneeReason: '',
      dueDate: '2026-11-12',
      dueReason: '',
      priority: 2,
      clientOptionId: '',
      workTypeKey: ''
    }
  ];

  it('frase con tarea, responsable y fecha, antes de la firma', () => {
    const s = createdSentence([{ title: 'Quitar animaciones' }], details);
    expect(s).toBe('Lo hemos registrado como tarea («Quitar animaciones») y lo lleva Jesus M, con fecha prevista el 12/11/2026.');
    const out = withSentence('Hola Enrique,\n\nPerfecto, confirmado.\n\nUn saludo,\nEquipo Kijutech', s);
    expect(out).toBe(`Hola Enrique,\n\nPerfecto, confirmado.\n\n${s}\n\nUn saludo,\nEquipo Kijutech`);
  });

  it('sin firma, la frase va al final', () => {
    expect(withSentence('Hola', 'Hecho.')).toBe('Hola\n\nHecho.');
  });
});

describe('medidas de calidad', () => {
  it('detecta la pregunta final de la prueba real y no las respuestas que cierran', () => {
    const real =
      'Hola Enrique,\n\nPerfecto, queda confirmado.\n\nCuando termine, ¿quieres que te avisemos para revisarlo juntos?\n\nUn saludo,\nEquipo Kijutech';
    expect(endsWithQuestion(real)).toBe(true);
    expect(endsWithQuestion('Hola,\n\nPerfecto, queda confirmado. Gracias.\n\nUn saludo,\nEquipo Kijutech')).toBe(false);
  });

  it('detecta las promesas de la prueba real', () => {
    expect(promisesAction('Recibido. Lo dejo anotado como encargo para cm-iberica')).toBe(true);
    expect(promisesAction('Actualizo el encargo y lo dejo asignado a Jesús')).toBe(true);
    expect(promisesAction('Se lo paso al equipo y te confirmamos.')).toBe(false);
  });
});

describe('botones del project manager en Telegram', () => {
  const id = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';
  it('solo responder, cambiar responsable y elegir persona', () => {
    expect(`ag:${id}:re`).toMatch(AGENT_CALLBACK_RE);
    expect(`ag:${id}:pa`).toMatch(AGENT_CALLBACK_RE);
    const m = `ag:${id}:as:81234567`.match(AGENT_CALLBACK_RE);
    expect(m?.[2]).toBe('as:81234567');
    expect(m?.[3]).toBe('81234567');
    expect(`ag:${id}:as:abc`).not.toMatch(AGENT_CALLBACK_RE);
    expect(`ag:${id}:as:81234567`.length).toBeLessThanOrEqual(64); // límite de Telegram
  });
});
