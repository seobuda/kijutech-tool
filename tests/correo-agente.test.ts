// Buzón del agente (paso 3): firma del webhook de Resend, autenticación del remitente, correos del
// equipo, validación de lo que devuelve la IA y la ruta pública.
import { createHmac, randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsInboundEmails, opsSettings } from '@/lib/db/schema';
import { encrypt } from '@/lib/ai/encryption';
import { authFromResend, saveWebhookSecret, verifyResendSignature } from '@/lib/operaciones/resend';
import { emailProposalSchema, emailProposalText } from '@/lib/operaciones/email-agent';
import { ingestInboundEmail, TEAM_NOTE } from '@/lib/operaciones/inbound-email';
import { validateInboundPayload } from '@/lib/operaciones/inbound-email-rules';
import { POST as postResendRoute } from '@/app/api/email/resend/route';
import { cleanupFixtures, createFixtures, type Fixtures } from './fixtures';

const secret = `whsec_${randomBytes(24).toString('base64')}`;
function sign(id: string, ts: number, body: string, s = secret) {
  const key = Buffer.from(s.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`;
}

describe('firma del webhook de Resend (formato Svix)', () => {
  const body = JSON.stringify({ type: 'email.received', data: { email_id: 'abc' } });
  const now = 1_800_000_000;

  it('acepta una firma válida y reciente, también entre varias firmas', () => {
    const sig = sign('msg_1', now, body);
    expect(verifyResendSignature(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now)).toBe(true);
    expect(
      verifyResendSignature(secret, { id: 'msg_1', timestamp: String(now), signature: `v1,AAAA ${sig}` }, body, now)
    ).toBe(true);
  });

  it('rechaza cuerpo cambiado, otro secreto, marca vieja o cabeceras que faltan', () => {
    const sig = sign('msg_1', now, body);
    expect(verifyResendSignature(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body + ' ', now)).toBe(false);
    const other = `whsec_${randomBytes(24).toString('base64')}`;
    expect(verifyResendSignature(other, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now + 600)).toBe(false);
    expect(verifyResendSignature(secret, { id: null, timestamp: String(now), signature: sig }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: 'msg_2', timestamp: String(now), signature: sig }, body, now)).toBe(false);
  });
});

describe('autenticación del remitente', () => {
  it('pass solo con DMARC; fail si algo falla; none sin datos', () => {
    expect(authFromResend({ spf: 'pass', dkim: 'pass', dmarc: 'pass' })).toBe('pass');
    expect(authFromResend({ spf: 'pass', dkim: 'fail', dmarc: 'pass' })).toBe('fail');
    expect(authFromResend({ spf: 'pass', dkim: 'pass' })).toBe('none');
    expect(authFromResend(null)).toBe('none');
  });
});

describe('lo que devuelve la IA', () => {
  it('se valida estrictamente: "false" no es verdadero y un tipo raro pasa a «otro»', () => {
    const p = emailProposalSchema.parse({ tipo: 'hackeo', necesita_respuesta: 'false', respuesta: 'x' });
    expect(p.necesita_respuesta).toBe(false);
    expect(p.tipo).toBe('otro');
    expect(p.confianza).toBe('baja');
  });

  it('el aviso de Telegram escapa el contenido del correo', () => {
    const text = emailProposalText(
      { fromAddress: 'a@b.com', fromName: '<b>Jefe</b>', subject: '<script>', authStatus: 'none' },
      { tipo: 'consulta', resumen: '<i>hola</i>', respuesta: 'Vale & gracias', encargo_sugerido: '', confianza: 'alta' },
      'Cliente: X'
    );
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;b&gt;Jefe&lt;/b&gt;');
    expect(text).toContain('Vale &amp; gracias');
    expect(text).toContain('⚠️'); // sin autenticación completa
  });
});

describe('entrada con base de datos', () => {
  let fx: Fixtures;
  beforeAll(async () => {
    fx = await createFixtures();
  });
  afterAll(async () => {
    await cleanupFixtures();
  });

  const payload = (over: Record<string, unknown>) => {
    const r = validateInboundPayload({ messageId: `<${randomBytes(6).toString('hex')}@x>`, from: 'a@cliente-raro.es', subject: 'Hola', text: 'Hola', ...over });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('un remitente que no pasa la autenticación no se reconoce ni se interpreta', async () => {
    const res = await ingestInboundEmail(fx.otherTenantId, payload({ auth: 'fail' }), 'resend');
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(opsInboundEmails).where(eq(opsInboundEmails.id, (res as { id: string }).id));
    expect(row.status).toBe('sin_cliente');
    expect(row.statusNote).toMatch(/no autenticado/);
  });

  it('un correo del dominio de la agencia entra como del equipo (para proponer respuesta)', async () => {
    const res = await ingestInboundEmail(fx.otherTenantId, payload({ from: 'jesus@kijutech.com', auth: 'pass' }), 'resend', {
      providerEmailId: 'prov-1',
      referencesHeader: '<a@x> <b@x>'
    });
    const [row] = await db.select().from(opsInboundEmails).where(eq(opsInboundEmails.id, (res as { id: string }).id));
    expect(row.status).toBe('nuevo');
    expect(row.statusNote).toBe(TEAM_NOTE);
    expect(row.providerEmailId).toBe('prov-1');
    expect(row.referencesHeader).toBe('<a@x> <b@x>');
  });

  it('la ruta pública: 404 sin cuenta o sin buzón conectado, 403 con firma mala', async () => {
    const url = (t: string) => `http://x/api/email/resend?t=${t}`;
    expect((await postResendRoute(new Request(url('no-es-uuid'), { method: 'POST', body: '{}' }))).status).toBe(404);
    expect((await postResendRoute(new Request(url(fx.otherTenantId), { method: 'POST', body: '{}' }))).status).toBe(404);

    await saveWebhookSecret(fx.otherTenantId, secret);
    await db
      .insert(opsSettings)
      .values({ tenantId: fx.otherTenantId, key: 'email_resend_key', value: JSON.stringify(encrypt('re_prueba_no_valida_123')) })
      .onConflictDoNothing();
    const body = JSON.stringify({ type: 'email.received', data: { email_id: 'abc12345' } });
    const ts = Math.floor(Date.now() / 1000);
    const bad = new Request(url(fx.otherTenantId), {
      method: 'POST',
      body,
      headers: { 'svix-id': 'm1', 'svix-timestamp': String(ts), 'svix-signature': 'v1,bm9wZQ==' }
    });
    expect((await postResendRoute(bad)).status).toBe(403);

    // Firma buena con un evento que no es de correo recibido: se acepta sin hacer nada (sin llamar a Resend).
    const other = JSON.stringify({ type: 'email.sent', data: {} });
    const ok = new Request(url(fx.otherTenantId), {
      method: 'POST',
      body: other,
      headers: { 'svix-id': 'm2', 'svix-timestamp': String(ts), 'svix-signature': sign('m2', ts, other) }
    });
    const res = await postResendRoute(ok);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
  });
});
