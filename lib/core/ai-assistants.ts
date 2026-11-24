// Núcleo · Asistentes de IA que mandan visitas a una web (Hito 2 SEO, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §5).
// Datos puros, sin dependencias: Agentes los usa para pedir a Analytics solo esas fuentes y Rendimiento para mostrarlas
// con su nombre. Ampliable: una fuente nueva se añade aquí y entra sola en la próxima descarga.

export type AiAssistant = { key: string; label: string; domains: string[] };

export const AI_ASSISTANTS: AiAssistant[] = [
  { key: 'chatgpt', label: 'ChatGPT', domains: ['chatgpt.com', 'chat.openai.com', 'openai.com'] },
  { key: 'perplexity', label: 'Perplexity', domains: ['perplexity.ai', 'perplexity'] },
  { key: 'gemini', label: 'Gemini', domains: ['gemini.google.com', 'bard.google.com'] },
  { key: 'copilot', label: 'Copilot', domains: ['copilot.microsoft.com', 'copilot.com', 'edgeservices.bing.com'] },
  { key: 'claude', label: 'Claude', domains: ['claude.ai'] },
  { key: 'deepseek', label: 'DeepSeek', domains: ['chat.deepseek.com', 'deepseek.com'] },
  { key: 'meta', label: 'Meta AI', domains: ['meta.ai'] },
  { key: 'grok', label: 'Grok', domains: ['grok.com'] },
  { key: 'mistral', label: 'Le Chat (Mistral)', domains: ['chat.mistral.ai'] },
  { key: 'you', label: 'You.com', domains: ['you.com'] },
  { key: 'phind', label: 'Phind', domains: ['phind.com'] }
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Expresión (RE2, la que acepta Analytics) que casa el «sessionSource» de cualquier asistente de la lista. */
export const AI_SOURCE_REGEX = `^(.*\\.)?(${AI_ASSISTANTS.flatMap((a) => a.domains).map(esc).join('|')})$`;

/** El asistente al que pertenece una fuente de Analytics (p. ej. «chatgpt.com»), o null si no es de IA. */
export function aiAssistantOf(source: string): AiAssistant | null {
  const s = source.trim().toLowerCase();
  return AI_ASSISTANTS.find((a) => a.domains.some((d) => s === d || s.endsWith(`.${d}`))) ?? null;
}

/** Suma por asistente (varias fuentes del mismo asistente juntas), de mayor a menor. */
export function groupByAssistant(rows: { key: string; value: number }[]): { key: string; label: string; value: number }[] {
  const by = new Map<string, { key: string; label: string; value: number }>();
  for (const r of rows) {
    const a = aiAssistantOf(r.key);
    const k = a?.key ?? r.key;
    const cur = by.get(k) ?? { key: k, label: a?.label ?? r.key, value: 0 };
    cur.value += r.value;
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}
