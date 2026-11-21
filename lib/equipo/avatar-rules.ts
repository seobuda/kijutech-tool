// Reglas puras de las fotos del equipo (21 nov 2026): qué imagen se acepta. Se comprueba el contenido real (los primeros
// bytes), no solo lo que dice el navegador, y el tamaño: llega reducida a 256 px, así que 200 KB sobra.
export const AVATAR_MAX_BYTES = 200 * 1024;
export const AVATAR_MIMES = ['image/webp', 'image/png', 'image/jpeg'] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];

export function sniffMime(b: Uint8Array): AvatarMime | null {
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Valida una imagen enviada como data URL (data:image/webp;base64,…). */
export function parseAvatar(dataUrl: unknown): { ok: true; mime: AvatarMime; data: Buffer } | { ok: false; message: string } {
  if (typeof dataUrl !== 'string') return { ok: false, message: 'No llegó ninguna imagen.' };
  const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { ok: false, message: 'La imagen tiene que ser WebP, PNG o JPEG.' };
  const data = Buffer.from(m[2], 'base64');
  if (data.length === 0) return { ok: false, message: 'La imagen está vacía.' };
  if (data.length > AVATAR_MAX_BYTES) return { ok: false, message: 'La imagen es demasiado grande (máximo 200 KB).' };
  const real = sniffMime(data);
  if (!real || real !== m[1]) return { ok: false, message: 'El archivo no es una imagen válida.' };
  return { ok: true, mime: real, data };
}
