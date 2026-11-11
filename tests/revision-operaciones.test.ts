// Pruebas de los arreglos de la revisión de Operaciones (11 nov 2026). Sin base de datos.
import { describe, expect, it } from 'vitest';
import { FLOW_CALLBACK_RE } from '@/lib/operaciones/telegram-handler';
import { noticeKeyboard } from '@/lib/operaciones/notifications';
import { clampMessage, htmlToPlain } from '@/lib/operaciones/telegram';
import { sourceIsUntrusted, strictBool } from '@/lib/operaciones/blockers';

const REQ = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';

describe('botones de Telegram', () => {
  it('todo botón que genera noticeKeyboard lo reconoce el manejador (también con varios responsables)', () => {
    for (const workStatus of ['asignado', 'en_curso', 'devuelto', 'bloqueado']) {
      for (const candidateIds of [null, ['111'], ['111', '222']]) {
        for (const later of [false, true]) {
          const kb = noticeKeyboard({ id: REQ, workStatus, candidateIds }, { forUser: '222', later });
          for (const b of kb.flat()) expect(b.callback_data).toMatch(FLOW_CALLBACK_RE);
        }
      }
    }
  });

  it('con varios responsables, el botón lleva la persona y se extrae bien', () => {
    const kb = noticeKeyboard({ id: REQ, workStatus: 'asignado', candidateIds: ['111', '222'] }, { forUser: '222', later: false });
    const m = kb[0][0].callback_data.match(FLOW_CALLBACK_RE);
    expect(m?.[1]).toBe('st');
    expect(m?.[3]).toBe('222');
  });
});

describe('recorte de mensajes HTML', () => {
  it('no deja etiquetas ni entidades a medias y cierra las abiertas', () => {
    const html = `<b>${'x'.repeat(980)}</b> <a href="https://ejemplo.com/una-ruta-larga">enlace</a> &amp; más`;
    for (let max = 900; max <= 1060; max++) {
      const out = clampMessage(html, max);
      expect(out.length).toBeLessThanOrEqual(max);
      expect(out).not.toMatch(/<[^>]*$/m); // ninguna etiqueta sin cerrar el «>»
      expect(out).not.toMatch(/&[#a-z0-9]*…/i); // ninguna entidad partida
      const opens = (out.match(/<(b|a)[\s>]/g) ?? []).length;
      const closes = (out.match(/<\/(b|a)>/g) ?? []).length;
      expect(closes).toBe(opens);
    }
  });

  it('un mensaje corto no cambia', () => {
    expect(clampMessage('<b>hola</b>', 100)).toBe('<b>hola</b>');
  });

  it('texto plano de reserva', () => {
    expect(htmlToPlain('<b>A &amp; B</b> <a href="https://x.y">ver</a> &lt;3')).toBe('A & B ver (https://x.y) <3');
  });
});

describe('triaje de bloqueos', () => {
  it('el booleano es estricto: "false" no se convierte en true', () => {
    expect(strictBool.parse('false')).toBe(false);
    expect(strictBool.parse('true')).toBe(true);
    expect(strictBool.parse(false)).toBe(false);
    expect(strictBool.parse(true)).toBe(true);
    expect(strictBool.parse('sí')).toBe(false);
    expect(strictBool.parse(1)).toBe(false);
  });

  it('una respuesta apoyada en comentarios de ClickUp no se envía sola', () => {
    expect(sourceIsUntrusted('comentario de Jesús del 3 nov')).toBe(true);
    expect(sourceIsUntrusted('Comentarios de la tarea')).toBe(true);
    expect(sourceIsUntrusted('descripción de la tarea')).toBe(false);
  });
});
