// SEO · Correo de 3 preguntas (Hito 2, 24 nov 2026): reglas puras.
import { describe, expect, it } from 'vitest';
import {
  cleanAnswers,
  fieldsFromDedupeKey,
  pickQuestions,
  questionCandidates,
  questionsDedupeKey,
  questionsEmail,
  quoteInText,
  ruleAnswers,
  stripQuotedReply,
  type FactForQuestions
} from '@/lib/seo/preguntas/rules';

const P = '11111111-2222-3333-4444-555555555555';
const f = (field: string, value: unknown, source: FactForQuestions['source'] = 'ficha', confidence = 70, status = 'provisional'): FactForQuestions => ({ field, value, source, confidence, status });

describe('preguntas: candidatas', () => {
  it('pregunta lo que falta, en orden de peso, y como mucho 3', () => {
    const qs = pickQuestions(questionCandidates([f('nombre', 'CM Ibérica'), f('web', 'https://cm-iberica.es')]));
    expect(qs.map((q) => q.field)).toEqual(['telefono', 'direccion', 'servicios']);
    expect(qs.every((q) => q.reason === 'falta')).toBe(true);
  });

  it('dos fuentes con teléfonos distintos: pregunta cuál es el bueno, con las dos opciones', () => {
    const qs = questionCandidates([f('nombre', 'X'), f('telefono', '+34931112233'), f('telefono', '+34915556677', 'web', 60)]);
    const t = qs.find((q) => q.field === 'telefono');
    expect(t?.reason).toBe('conflicto');
    expect(t?.text).toContain('+34931112233');
    expect(t?.text).toContain('+34915556677');
  });

  it('lo confirmado por una persona no se pregunta; lo dudoso sí', () => {
    const qs = questionCandidates([
      f('telefono', '+34931112233', 'persona', 100, 'confirmado'),
      f('telefono', '+34915556677', 'web', 45),
      f('zona', 'Barcelona', 'ia', 40)
    ]);
    expect(qs.find((q) => q.field === 'telefono')).toBeUndefined();
    expect(qs.find((q) => q.field === 'zona')?.reason).toBe('dudoso');
  });

  it('mismo nombre escrito distinto no es conflicto', () => {
    const qs = questionCandidates([f('nombre', 'CM Ibérica'), f('nombre', 'cm iberica', 'web', 60)]);
    expect(qs.find((q) => q.field === 'nombre')).toBeUndefined();
  });
});

describe('preguntas: correo y clave', () => {
  it('plantilla con las preguntas numeradas y asunto según cuántas', () => {
    const qs = pickQuestions(questionCandidates([f('nombre', 'X')]));
    const e = questionsEmail({ businessName: 'CM Ibérica', questions: qs });
    expect(e.subject).toBe('3 preguntas rápidas sobre CM Ibérica');
    expect(e.body).toMatch(/\n1\. .+\n2\. .+\n3\. /);
  });

  it('los campos preguntados viajan en la clave y se recuperan', () => {
    const k = questionsDedupeKey(P, '2026-11-24', ['telefono', 'servicios']);
    expect(k).toBe(`preguntas:${P}:20261124:telefono,servicios`);
    expect(fieldsFromDedupeKey(k)).toEqual(['telefono', 'servicios']);
    expect(fieldsFromDedupeKey('msg:otra-cosa')).toEqual([]);
  });
});

describe('preguntas: respuestas', () => {
  const reply = 'Hola! El teléfono bueno es el 93 111 22 33. Hacemos limpieza de oficinas, cristales y mantenimiento.\nSaludos';

  it('solo guarda datos con cita presente en el texto y forma válida', () => {
    const raw = {
      respuestas: [
        { campo: 'telefono', valor: '93 111 22 33', cita: 'El teléfono bueno es el 93 111 22 33' },
        { campo: 'servicios', valor: ['limpieza de oficinas', 'cristales', 'mantenimiento'], cita: 'Hacemos limpieza de oficinas, cristales y mantenimiento' },
        { campo: 'zona', valor: 'Toda Cataluña', cita: 'trabajamos en toda Cataluña' }, // cita inventada
        { campo: 'direccion', valor: { calle: 'x' }, cita: 'Hola' } // no se preguntó
      ]
    };
    const a = cleanAnswers(raw, ['telefono', 'servicios', 'zona'], reply);
    expect(a.map((x) => x.field)).toEqual(['telefono', 'servicios']);
    expect(a[0].value).toBe('+34931112233');
    expect(a[1].value).toEqual(['limpieza de oficinas', 'cristales', 'mantenimiento']);
  });

  it('la cita se compara sin tildes, mayúsculas ni espacios de más', () => {
    expect(quoteInText('el TELEFONO  bueno', reply)).toBe(true);
    expect(quoteInText('otro teléfono', reply)).toBe(false);
  });

  it('dirección: necesita población o código postal', () => {
    const text = 'Estamos en Calle Mayor 3, 08001 Barcelona';
    expect(cleanAnswers({ respuestas: [{ campo: 'direccion', valor: { calle: 'Calle Mayor 3', codigo_postal: '08001', poblacion: 'Barcelona' }, cita: 'Calle Mayor 3, 08001 Barcelona' }] }, ['direccion'], text)[0].value).toMatchObject({
      street: 'Calle Mayor 3',
      postalCode: '08001',
      city: 'Barcelona'
    });
    expect(cleanAnswers({ respuestas: [{ campo: 'direccion', valor: { calle: 'Calle Mayor 3' }, cita: 'Calle Mayor 3' }] }, ['direccion'], text)).toEqual([]);
  });

  it('sin IA: solo un teléfono, y solo si hay uno', () => {
    expect(ruleAnswers(['telefono'], reply)[0]?.value).toBe('+34931112233');
    expect(ruleAnswers(['telefono'], 'el 93 111 22 33 o el 91 555 66 77')).toEqual([]);
    expect(ruleAnswers(['zona'], reply)).toEqual([]);
  });

  it('quita nuestro correo citado debajo de la respuesta', () => {
    const t = 'El bueno es el segundo.\n\nEl lun, 24 nov 2026 a las 10:00, Equipo Kijutech <agente@equipo.kijutech.com> escribió:\n> 1. Nos aparecen datos distintos...';
    expect(stripQuotedReply(t)).toBe('El bueno es el segundo.');
    expect(stripQuotedReply('Respuesta\n> citado')).toBe('Respuesta');
  });
});
