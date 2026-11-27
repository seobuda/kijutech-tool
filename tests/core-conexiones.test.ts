// Núcleo · conexiones del cliente y leads (27 nov 2026; docs/DISENO-SEO-CIERRE.md §C). La forma del envío es la que
// devolvió una subcuenta real de GoHighLevel el 27 nov (con los datos personales cambiados).
import { describe, expect, it } from 'vitest';
import { cleanUrl, leadChannel, parseGhlSubmission } from '@/lib/core/leads-rules';

const SUB = {
  id: 'sub-1',
  contactId: 'c-1',
  formId: 'form-1',
  name: 'Persona Prueba',
  email: 'persona@example.com',
  createdAt: '2026-11-24T16:20:40.713Z',
  others: {
    email: 'persona@example.com',
    phone: '+34600000000',
    ip: '1.2.3.4',
    eventData: {
      source: 'Social media',
      referrer: 'http://m.facebook.com',
      url_params: { utm_medium: 'paid', utm_source: 'fb', utm_campaign: '123' },
      page: { url: 'https://Cliente.com/pilates-en-sant-cugat/promo/?utm_medium=paid&email=persona@example.com#x', title: '' },
      domain: 'api.leadconnectorhq.com'
    }
  }
};

describe('leads: lectura de un envío de GoHighLevel', () => {
  it('guarda página sin parámetros, canal, UTM, y nada personal', () => {
    const p = parseGhlSubmission(SUB)!;
    expect(p.externalId).toBe('sub-1');
    expect(p.pageUrl).toBe('https://cliente.com/pilates-en-sant-cugat/promo/');
    expect(p.referrer).toBe('http://m.facebook.com/');
    expect(p.channel).toBe('pago');
    expect(p.utm).toEqual({ utm_medium: 'paid', utm_source: 'fb', utm_campaign: '123' });
    expect(p.hasGclid).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/persona|600000000|1\.2\.3\.4/);
  });
  it('sin id o fecha, nada', () => {
    expect(parseGhlSubmission({ createdAt: '2026-11-01' })).toBeNull();
    expect(parseGhlSubmission({ id: 'x', createdAt: 'no' })).toBeNull();
    expect(parseGhlSubmission(null)).toBeNull();
  });
  it('gclid en la URL = anuncio de Google', () => {
    const p = parseGhlSubmission({ ...SUB, others: { eventData: { source: 'Organic Search', page: { url: 'https://c.com/a?gclid=abc' } } } })!;
    expect(p.channel).toBe('pago');
    expect(p.hasGclid).toBe(true);
  });
});

describe('leads: canal', () => {
  it('normaliza las fuentes de GoHighLevel', () => {
    expect(leadChannel('Organic Search', {}, false)).toBe('organico');
    expect(leadChannel('Direct traffic', {}, false)).toBe('directo');
    expect(leadChannel('Social media', {}, false)).toBe('social');
    expect(leadChannel('Referral', {}, false)).toBe('referido');
    expect(leadChannel('Paid Search', {}, false)).toBe('pago');
    expect(leadChannel('CRM UI', {}, false)).toBe('otros');
  });
  it('URL: solo http(s), sin parámetros', () => {
    expect(cleanUrl('javascript:alert(1)')).toBeNull();
    expect(cleanUrl('https://a.com/b?c=d')).toBe('https://a.com/b');
  });
});

import { draftHtml, maskTail, wpBaseUrl, wpEditUrl, wpUserProblem } from '@/lib/core/connections-rules';

describe('WordPress: lista blanca de permisos (auditoría, grave 3)', () => {
  const contributor = { roles: ['contributor'], capabilities: { read: true, edit_posts: true, delete_posts: true, level_1: true, contributor: true } };
  it('acepta un Colaborador normal', () => {
    expect(wpUserProblem(contributor)).toBeNull();
  });
  it('rechaza otros roles, varios roles y permisos de más', () => {
    expect(wpUserProblem({ roles: ['author'] })).toMatch(/Colaborador/);
    expect(wpUserProblem({ roles: ['contributor', 'shop_manager'] })).toMatch(/Colaborador/);
    expect(wpUserProblem({ roles: ['contributor'], capabilities: { ...contributor.capabilities, upload_files: true } })).toMatch(/upload_files/);
    expect(wpUserProblem({ roles: ['contributor'], capabilities: { ...contributor.capabilities, publish_posts: true } })).toMatch(/publish_posts/);
    expect(wpUserProblem({ roles: ['contributor'], capabilities: { unfiltered_html: true } })).toMatch(/unfiltered_html/);
    expect(wpUserProblem(null)).toMatch(/no devolvió/);
  });
});

describe('WordPress: la contraseña solo va a la web del cliente (auditoría, 4)', () => {
  const webs = ['https://www.cliente.com', 'cliente.es'];
  it('https, puerto estándar, host del cliente', () => {
    expect(wpBaseUrl('https://cliente.com/', webs)).toEqual({ origin: 'https://cliente.com' });
    expect(wpBaseUrl('https://www.cliente.com/blog/', webs)).toEqual({ origin: 'https://www.cliente.com/blog' });
    expect(wpBaseUrl('http://cliente.com', webs)).toHaveProperty('error');
    expect(wpBaseUrl('https://cliente.com:8443', webs)).toHaveProperty('error');
    expect(wpBaseUrl('https://user:pw@cliente.com', webs)).toHaveProperty('error');
    expect(wpBaseUrl('https://atacante.com', webs)).toHaveProperty('error');
    expect(wpBaseUrl('https://cliente.com.atacante.com', webs)).toHaveProperty('error');
  });
});

describe('WordPress: borrador sin XSS (auditoría, 5)', () => {
  it('escapa todo y solo enlaza a https del cliente', () => {
    const h = draftHtml({ keyword: 'taller <b>', subtopics: ['<script>alert(1)</script>'], questions: ['"¿x?"'], links: [{ url: 'javascript:alert(1)', anchor: 'a' }, { url: 'https://otra.com/x', anchor: 'b' }, { url: 'https://cliente.com/ok', anchor: '<i>c</i>' }] }, 'cliente.com');
    expect(h).not.toMatch(/<script|<b>|<i>|javascript:|otra\.com/);
    expect(h).toContain('&lt;script&gt;');
    expect(h).toContain('<a href="https://cliente.com/ok">&lt;i&gt;c&lt;/i&gt;</a>');
  });
  it('enlace de edición construido por nosotros', () => {
    expect(wpEditUrl('https://cliente.com', 42.7)).toBe('https://cliente.com/wp-admin/post.php?post=42&action=edit');
    expect(maskTail('abcd efgh ijkl')).toBe('••••ijkl');
  });
});
