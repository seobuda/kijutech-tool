import { requirePagePermission } from '@/lib/auth/permissions';
import { getOpenAiKey, getVoiceSettings, DEFAULT_TONE, VOICES } from '@/lib/agentes/voice';
import { listAgents } from '@/lib/agentes/store';
import { VozView } from './voz-view';

export const dynamic = 'force-dynamic';

// Agentes → Voz: cómo suenan los agentes (modelo, voz, velocidad, tono) y cómo entienden los audios, con prueba en el navegador.
export default async function VozPage() {
  const user = await requirePagePermission('admin');
  const [settings, hasKey, agents] = await Promise.all([getVoiceSettings(user.tenantId), getOpenAiKey(user.tenantId).then(Boolean), listAgents(user.tenantId)]);
  return (
    <VozView
      settings={settings}
      defaultTone={DEFAULT_TONE}
      voices={[...VOICES]}
      hasKey={hasKey}
      agentVoices={agents.filter((a) => a.kind === 'principal').map((a) => ({ name: a.name, voice: a.voice }))}
    />
  );
}
