export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek'] as const;

export type AiProviderKey = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_META: Record<
  AiProviderKey,
  { label: string; emoji: string; defaultModel: string }
> = {
  anthropic: { label: 'Anthropic', emoji: '🤖', defaultModel: 'claude-sonnet-4-6' },
  openai: { label: 'OpenAI', emoji: '🟢', defaultModel: 'gpt-4o-mini' },
  gemini: { label: 'Gemini', emoji: '🔵', defaultModel: 'gemini-1.5-flash' },
  deepseek: { label: 'DeepSeek', emoji: '🐋', defaultModel: 'deepseek-chat' },
};

export const AI_KEY_MODE_LABELS: Record<string, string> = {
  platform_only: 'Solo plataforma',
  byok_allowed: 'BYOK permitido',
  byok_required: 'BYOK requerido',
};

// Proveedores seleccionables específicamente para embeddings — distinto
// de AI_PROVIDERS (proveedores de chat): Voyage AI no tiene modelos de
// chat, solo embeddings, así que no aparece en AI_PROVIDERS.
export const EMBEDDING_PROVIDERS = ['openai', 'gemini', 'voyage'] as const;

export type EmbeddingProviderKey = (typeof EMBEDDING_PROVIDERS)[number];

export const EMBEDDING_PROVIDER_META: Record<EmbeddingProviderKey, { label: string }> = {
  openai: { label: 'OpenAI' },
  gemini: { label: 'Gemini' },
  voyage: { label: 'Voyage AI' },
};

// Modelo de embeddings por defecto para cada proveedor — cubre tanto los
// 3 proveedores seleccionables como los proveedores de chat que no tienen
// override explícito (embedding_provider null → se usa el proveedor de
// chat, y este mapa da su modelo de embeddings, que nunca es el mismo
// valor que el modelo de chat configurado). DeepSeek no tiene API de
// embeddings propia, por eso no tiene entrada aquí.
export const DEFAULT_EMBEDDING_MODEL: Record<string, string> = {
  anthropic: 'voyage-3',
  voyage: 'voyage-3',
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
};
