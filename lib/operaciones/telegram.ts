// Cliente mínimo de la API de Bots de Telegram (solo fetch, sin dependencias).
// El token va en la URL, así que NUNCA se incluye en mensajes de error ni logs.
const API = 'https://api.telegram.org';

export class TelegramError extends Error {
  constructor(
    message: string,
    public code?: number,
    public retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export type TgUser = { id: number; is_bot?: boolean; first_name?: string; username?: string };
export type TgChat = { id: number; type: string; username?: string };
export type TgMessage = { message_id: number; chat: TgChat; from?: TgUser; text?: string };
export type TgCallbackQuery = { id: string; from: TgUser; message?: TgMessage; data?: string };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery };

function scrub(text: string, token: string): string {
  return text.split(token).join('«token»');
}

export async function tg<T>(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 20_000
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store'
    });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new TelegramError('Telegram no responde (tiempo de espera agotado)');
    }
    throw new TelegramError(
      scrub(`No se pudo conectar con Telegram${e instanceof Error ? `: ${e.message}` : ''}`, token)
    );
  }

  let json: { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } } | null =
    null;
  try {
    json = await res.json();
  } catch {
    // respuesta que no es JSON
  }
  if (!json?.ok) {
    throw new TelegramError(
      scrub(json?.description ?? `Telegram respondió HTTP ${res.status}`, token),
      json?.error_code ?? res.status,
      json?.parameters?.retry_after
    );
  }
  return json.result as T;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Mensaje de Telegram: máximo 4096 caracteres.
export function clampMessage(html: string, max = 4000): string {
  return html.length <= max ? html : `${html.slice(0, max - 20)}…\n(mensaje recortado)`;
}
