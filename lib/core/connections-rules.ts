// Núcleo · conexiones del cliente: reglas puras (27 nov 2026; docs/DISENO-SEO-CIERRE.md §C con la auditoría Opus). Sin base
// de datos ni red: se prueban en tests/core-conexiones.test.ts.

/**
 * WordPress (auditoría, hallazgo grave 3): LISTA BLANCA. El usuario tiene que ser exactamente «contributor» y no tener
 * ninguna capacidad que permita publicar, subir archivos, meter HTML sin filtrar, editar lo ajeno o lo publicado, ni
 * administrar. Devuelve null si vale o el motivo del rechazo.
 */
export function wpUserProblem(me: { roles?: unknown; capabilities?: unknown } | null): string | null {
  if (!me || typeof me !== 'object') return 'WordPress no devolvió el usuario (¿contraseña de aplicación bloqueada por un plugin de seguridad o por el hosting?).';
  const roles = Array.isArray(me.roles) ? me.roles.map(String) : [];
  if (roles.length !== 1 || roles[0] !== 'contributor') return `El usuario tiene que tener solo el rol «Colaborador» (tiene: ${roles.join(', ') || 'ninguno'}).`;
  const caps = me.capabilities && typeof me.capabilities === 'object' ? Object.entries(me.capabilities as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k) : [];
  const bad = caps.filter((c) => /^(publish_|manage_|edit_published_|edit_others_|delete_published_|delete_others_|upload_files$|unfiltered_html$|install_|activate_|update_|edit_theme|edit_plugins|create_users|promote_users|switch_themes|import$|export$)/.test(c));
  if (bad.length) return `El usuario tiene permisos de más (${bad.slice(0, 4).join(', ')}). Usa un usuario Colaborador sin cambios de permisos.`;
  return null;
}

/** Normaliza el host de una web (sin www, en minúsculas). */
export function siteHost(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * La URL de WordPress tiene que ser https, en el puerto estándar, sin usuario ni contraseña en la URL, y su host una de las
 * webs del cliente (auditoría, hallazgo 4: la contraseña no puede viajar a otro servidor). Devuelve el origen o un error.
 */
export function wpBaseUrl(raw: string, clientWebs: string[]): { origin: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: 'La dirección de la web no es válida.' };
  }
  if (u.protocol !== 'https:') return { error: 'La web tiene que ir por https.' };
  if (u.port && u.port !== '443') return { error: 'Solo el puerto estándar de https.' };
  if (u.username || u.password) return { error: 'La dirección no puede llevar usuario ni contraseña.' };
  const h = siteHost(u.hostname);
  const webs = clientWebs.map(siteHost).filter(Boolean);
  if (!h || !webs.includes(h)) return { error: 'La web tiene que ser una de las webs del cliente (ficha → Webs y cuentas).' };
  const path = u.pathname.replace(/\/+$/, '');
  return { origin: `https://${u.hostname.toLowerCase()}${path}` };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Esqueleto HTML del borrador a partir del brief (auditoría, hallazgo 5): todo el texto se escapa (viene de webs ajenas) y
 * solo se enlaza a https del dominio del cliente. Nada de scripts, estilos ni atributos.
 */
export function draftHtml(input: { keyword: string; subtopics: string[]; questions: string[]; links: { url: string; anchor: string }[]; notes?: string | null }, clientHost: string | null): string {
  const out: string[] = [];
  out.push(`<p><em>${esc(`Borrador preparado por Kijutech para «${input.keyword}». Sustituye cada apartado por el texto definitivo y borra esta línea antes de pedir la revisión.`)}</em></p>`);
  if (input.notes) out.push(`<p>${esc(input.notes)}</p>`);
  for (const s of input.subtopics.slice(0, 15)) out.push(`<h2>${esc(s)}</h2>`, '<p>[Escribir aquí]</p>');
  if (input.questions.length) {
    out.push(`<h2>${esc('Preguntas frecuentes')}</h2>`);
    for (const q of input.questions.slice(0, 10)) out.push(`<h3>${esc(q)}</h3>`, '<p>[Respuesta]</p>');
  }
  const ok = input.links.filter((l) => {
    try {
      const u = new URL(l.url);
      return u.protocol === 'https:' && clientHost && siteHost(u.hostname) === clientHost;
    } catch {
      return false;
    }
  });
  if (ok.length) {
    out.push(`<h2>${esc('Enlaces internos sugeridos (quitar este apartado)')}</h2>`, '<ul>');
    for (const l of ok.slice(0, 10)) out.push(`<li><a href="${esc(l.url)}">${esc(l.anchor || l.url)}</a></li>`);
    out.push('</ul>');
  }
  return out.join('\n');
}

/** Enlace de edición construido por nosotros (nunca el «link» de la respuesta, que podría ser cualquier cosa). */
export function wpEditUrl(origin: string, postId: number): string {
  return `${origin}/wp-admin/post.php?post=${Math.trunc(postId)}&action=edit`;
}

/** Enmascara un secreto para la pantalla. */
export function maskTail(s: string | null | undefined): string {
  if (!s) return '';
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}
