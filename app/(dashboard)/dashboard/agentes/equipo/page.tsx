import { requirePagePermission } from '@/lib/auth/permissions';
import { getAgent, ensureDefaultAgents, OPS_HEAD_KEY } from '@/lib/agentes/store';
import { getTeamSettings, listTeamQuestions } from '@/lib/agentes/team';
import { EquipoView, type QuestionRow } from './equipo-view';

export const dynamic = 'force-dynamic';

// Agentes → Dudas del equipo (20 nov 2026): el jefe de Operaciones contesta las dudas del equipo por su chat de siempre.
// Aquí se enciende, se ajusta (autonomía de la IA general, intentos) y se ve cada duda con su fuente, lo que costó,
// si sirvió, y se responde o aprueba lo pendiente (lo mismo que por Telegram).
export default async function EquipoPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requirePagePermission('admin');
  await ensureDefaultAgents(user.tenantId);
  const sp = await searchParams;
  const filter = ['abiertas', 'todas'].includes(sp.estado ?? '') ? (sp.estado as string) : 'abiertas';
  const [jefe, settings, rows] = await Promise.all([getAgent(user.tenantId, OPS_HEAD_KEY), getTeamSettings(user.tenantId), listTeamQuestions(user.tenantId, { status: filter === 'todas' ? undefined : 'abiertas', limit: 150 })]);
  const data: QuestionRow[] = rows.map((q) => ({
    id: q.id,
    askedBy: q.askedByName,
    question: q.question,
    followups: ((q.followups as { text: string }[]) ?? []).map((f) => f.text),
    status: q.status,
    tier: q.tier,
    topic: q.topicKey,
    aiAnswer: q.aiAnswer,
    finalAnswer: q.finalAnswer,
    answeredBy: q.answeredBy,
    feedback: q.feedback,
    feedbackNote: q.feedbackNote,
    reason: q.escalationReason,
    revisions: ((q.revisions as { instruction: string }[]) ?? []).map((r) => r.instruction),
    tools: ((q.toolCalls as { name: string }[]) ?? []).map((t) => t.name),
    costUsd: Number(q.costUsd ?? 0),
    createdAt: q.createdAt.toISOString()
  }));
  return <EquipoView active={Boolean(jefe?.active)} model={jefe?.model ?? ''} settings={settings} rows={data} filter={filter} />;
}
