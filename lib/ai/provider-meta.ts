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
