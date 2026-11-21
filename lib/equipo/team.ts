// Equipo humano + IA (fase 3 de la reorganización UX, 21 nov 2026): personas (Operaciones, ops_team_profiles) y agentes
// (Agentes, agt_agents) como un solo equipo, colocados en el organigrama (agt_departments) con su foto o avatar, su estado
// ahora y la actividad del día en un solo registro. Es una vista de la aplicación, como el Inicio: solo LEE de los dos
// módulos; cada módulo sigue siendo dueño de sus datos.
import 'server-only';
import { and, desc, eq, gte, inArray, isNotNull, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtAgentAvatars, agtJobs, agtTeamQuestions, opsAgentActions, opsRequestEvents, opsRequests, opsTeamAvatars, opsTeamProfiles } from '@/lib/db/schema';
import { listAgents, listDepartments } from '@/lib/agentes/store';
import { getCurrentDays } from '@/lib/operaciones/jornada';
import { STATUS_LABEL, type DayStatus } from '@/lib/operaciones/jornada-core';

export type MemberKind = 'persona' | 'agente';
export type Tone = 'success' | 'warning' | 'neutral' | 'info' | 'brand';

export type Member = {
  kind: MemberKind;
  id: string;
  name: string;
  role: string;
  deptKey: string | null;
  isHead: boolean;
  active: boolean;
  /** Estado ahora (personas: jornada; agentes: si tienen trabajos en marcha). */
  status: { label: string; tone: Tone; detail: string | null };
  avatarUrl: string | null;
  initials: string;
  /** Tono del círculo de iniciales (0-7), estable por nombre. */
  hue: number;
  /** Para enlazar con la actividad. */
  clickupUserId: string | null;
  agentKey: string | null;
};

export type OrgDept = { key: string; name: string; reportsTo: string; head: Member | null; members: Member[] };
export type TeamOrg = { depts: OrgDept[]; unassigned: Member[]; all: Member[] };

export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s.\-_]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join('') || '?'
  );
}

export function hueOf(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 8;
}

const STATUS_TONE: Record<DayStatus, Tone> = {
  trabajando: 'success',
  descanso: 'warning',
  comida: 'warning',
  fuera: 'warning',
  sin_empezar: 'neutral',
  terminado: 'neutral',
  ausente: 'neutral'
};

export const avatarUrl = (kind: MemberKind, id: string, updatedAt: Date) => `/api/equipo/avatar?tipo=${kind}&id=${id}&v=${updatedAt.getTime()}`;

/** Organigrama con personas y agentes. `withDetail` = mostrar en qué tarea está cada uno (solo admin). */
export async function getTeamOrg(tenantId: string, opts: { withDetail: boolean }): Promise<TeamOrg> {
  const [departments, agents, profiles, personAvatars, agentAvatars, days, busy] = await Promise.all([
    listDepartments(tenantId),
    listAgents(tenantId),
    db
      .select({ id: opsTeamProfiles.id, name: opsTeamProfiles.name, jobTitle: opsTeamProfiles.jobTitle, clickupUserId: opsTeamProfiles.clickupUserId, departmentKey: opsTeamProfiles.departmentKey })
      .from(opsTeamProfiles)
      .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.active, true))),
    db.select({ id: opsTeamAvatars.profileId, at: opsTeamAvatars.updatedAt }).from(opsTeamAvatars).where(eq(opsTeamAvatars.tenantId, tenantId)),
    db.select({ id: agtAgentAvatars.agentId, at: agtAgentAvatars.updatedAt }).from(agtAgentAvatars).where(eq(agtAgentAvatars.tenantId, tenantId)),
    getCurrentDays(tenantId),
    db.select({ agentId: agtJobs.agentId, title: agtJobs.title }).from(agtJobs).where(and(eq(agtJobs.tenantId, tenantId), eq(agtJobs.status, 'trabajando')))
  ]);
  const pAv = new Map(personAvatars.map((a) => [a.id, a.at]));
  const aAv = new Map(agentAvatars.map((a) => [a.id, a.at]));
  const heads = new Set(departments.map((d) => d.headAgentKey).filter(Boolean));

  const people: Member[] = profiles.map((p) => {
    const day = p.clickupUserId ? days.get(p.clickupUserId) : undefined;
    const st = day?.state.status;
    const at = pAv.get(p.id);
    return {
      kind: 'persona',
      id: p.id,
      name: p.name,
      role: p.jobTitle ?? '',
      deptKey: p.departmentKey,
      isHead: false,
      active: true,
      status: st
        ? { label: STATUS_LABEL[st], tone: STATUS_TONE[st], detail: opts.withDetail && st === 'trabajando' ? (day?.state.activeTask?.name ?? null) : null }
        : { label: 'Sin jornada', tone: 'neutral', detail: null },
      avatarUrl: at ? avatarUrl('persona', p.id, at) : null,
      initials: initialsOf(p.name),
      hue: hueOf(p.name),
      clickupUserId: p.clickupUserId,
      agentKey: null
    };
  });

  const bots: Member[] = agents.map((a) => {
    const jobs = busy.filter((j) => j.agentId === a.id);
    const at = aAv.get(a.id);
    return {
      kind: 'agente',
      id: a.id,
      name: a.name,
      role: a.role.split('\n')[0]?.slice(0, 140) ?? '',
      deptKey: a.departmentKey,
      isHead: heads.has(a.key),
      active: a.active,
      status: !a.active
        ? { label: 'Apagado', tone: 'neutral', detail: null }
        : jobs.length
          ? { label: 'Trabajando', tone: 'success', detail: opts.withDetail ? jobs[0].title : null }
          : { label: 'Disponible', tone: 'info', detail: null },
      avatarUrl: at ? avatarUrl('agente', a.id, at) : null,
      initials: initialsOf(a.name),
      hue: hueOf(a.name),
      clickupUserId: null,
      agentKey: a.key
    };
  });

  const all = [...bots, ...people];
  const byName = (x: Member, y: Member) => Number(y.kind === 'agente') - Number(x.kind === 'agente') || x.name.localeCompare(y.name, 'es');
  const depts: OrgDept[] = departments
    .filter((d) => d.active)
    .map((d) => {
      const head = bots.find((b) => b.agentKey === d.headAgentKey) ?? null;
      return {
        key: d.key,
        name: d.name,
        reportsTo: d.reportsTo,
        head,
        members: all.filter((m) => m.deptKey === d.key && m !== head).sort(byName)
      };
    });
  const known = new Set(depts.map((d) => d.key));
  const unassigned = all.filter((m) => !m.deptKey || !known.has(m.deptKey)).sort(byName);
  return { depts, unassigned, all };
}

// --- Actividad del día ------------------------------------------------------------------------------------------

export type ActivityItem = { key: string; at: Date; who: string; whoKind: MemberKind | 'sistema'; text: string; clickupUserId: string | null; agentKey: string | null };

/** Qué ha pasado cada vez que alguien del equipo pulsa un botón (los que son del sistema no salen en el registro). */
const EVENT_TEXT: Partial<Record<string, (title: string) => string>> = {
  seen: (t) => `vio el aviso de «${t}»`,
  later: (t) => `dejó para más tarde «${t}»`,
  start: (t) => `empezó «${t}»`,
  blocked: (t) => `se bloqueó en «${t}»`,
  done: (t) => `terminó «${t}»`,
  done_review: (t) => `entregó para revisar «${t}»`,
  accepted: (t) => `«${t}» fue aceptado`,
  returned: (t) => `«${t}» fue devuelto`,
  clickup_closed: (t) => `cerró «${t}» en ClickUp`,
  reassigned: (t) => `reasignó «${t}»`
};
export const PERSON_EVENTS = Object.keys(EVENT_TEXT);

function startOfDayMadrid(now: Date): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  // Medianoche de Madrid aproximada (±1 h según horario): suficiente para «lo de hoy».
  const utcMidnight = new Date(`${ymd}T00:00:00Z`);
  const offsetMin = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || 0) * 60;
  return new Date(utcMidnight.getTime() - offsetMin * 60_000);
}

/** Actividad de hoy de personas y agentes, lo más reciente primero (como mucho `limit`). */
export async function getActivityToday(tenantId: string, opts: { limit?: number; now?: Date } = {}): Promise<ActivityItem[]> {
  const since = startOfDayMadrid(opts.now ?? new Date());
  const limit = opts.limit ?? 60;
  const [events, jobs, answers, actions, agents] = await Promise.all([
    db
      .select({ id: opsRequestEvents.id, at: opsRequestEvents.createdAt, type: opsRequestEvents.eventType, who: opsRequestEvents.personName, cu: opsRequestEvents.personClickupUserId, title: opsRequests.title })
      .from(opsRequestEvents)
      .leftJoin(opsRequests, eq(opsRequests.id, opsRequestEvents.requestId))
      .where(and(eq(opsRequestEvents.tenantId, tenantId), gte(opsRequestEvents.createdAt, since), inArray(opsRequestEvents.eventType, PERSON_EVENTS), isNotNull(opsRequestEvents.personName)))
      .orderBy(desc(opsRequestEvents.createdAt))
      .limit(limit),
    db
      .select({ id: agtJobs.id, agentId: agtJobs.agentId, title: agtJobs.title, status: agtJobs.status, createdAt: agtJobs.createdAt, finishedAt: agtJobs.finishedAt })
      .from(agtJobs)
      .where(and(eq(agtJobs.tenantId, tenantId), gte(agtJobs.createdAt, since), notInArray(agtJobs.status, ['cancelado'])))
      .orderBy(desc(agtJobs.createdAt))
      .limit(limit),
    db
      .select({ id: agtTeamQuestions.id, by: agtTeamQuestions.askedByName, answeredBy: agtTeamQuestions.answeredBy, at: agtTeamQuestions.answeredAt })
      .from(agtTeamQuestions)
      .where(and(eq(agtTeamQuestions.tenantId, tenantId), gte(agtTeamQuestions.answeredAt, since)))
      .orderBy(desc(agtTeamQuestions.answeredAt))
      .limit(limit),
    db
      .select({ id: opsAgentActions.id, summary: opsAgentActions.summary, status: opsAgentActions.status, at: opsAgentActions.createdAt })
      .from(opsAgentActions)
      .where(and(eq(opsAgentActions.tenantId, tenantId), gte(opsAgentActions.createdAt, since)))
      .orderBy(desc(opsAgentActions.createdAt))
      .limit(limit),
    listAgents(tenantId)
  ]);
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const manager = agents.find((a) => a.kind === 'principal');
  const jefeOps = agents.find((a) => a.key === 'jefe_operaciones');

  const items: ActivityItem[] = [];
  for (const e of events) {
    const fn = EVENT_TEXT[e.type];
    if (!fn) continue;
    items.push({ key: `e-${e.id}`, at: e.at, who: e.who ?? 'Alguien', whoKind: 'persona', text: fn(e.title ?? 'una tarea'), clickupUserId: e.cu, agentKey: null });
  }
  for (const j of jobs) {
    const a = agentById.get(j.agentId);
    const name = a?.name ?? 'Un agente';
    const text = j.status === 'hecho' ? `entregó «${j.title}»` : j.status === 'fallido' ? `no pudo terminar «${j.title}»` : `está con «${j.title}»`;
    items.push({ key: `j-${j.id}`, at: j.finishedAt ?? j.createdAt, who: name, whoKind: 'agente', text, clickupUserId: null, agentKey: a?.key ?? null });
  }
  for (const q of answers) {
    if (!q.at) continue;
    const byEnric = q.answeredBy === 'enric';
    items.push({
      key: `q-${q.id}`,
      at: q.at,
      who: byEnric ? 'Enric' : (jefeOps?.name ?? 'Jefe de operaciones'),
      whoKind: byEnric ? 'persona' : 'agente',
      text: `respondió una duda de ${q.by}`,
      clickupUserId: null,
      agentKey: byEnric ? null : (jefeOps?.key ?? null)
    });
  }
  for (const x of actions) {
    const verb = x.status === 'propuesto' ? 'propuso' : x.status === 'auto' ? 'hizo solo' : x.status === 'rechazado' ? 'propuso (rechazado)' : 'propuso (aprobado)';
    items.push({ key: `a-${x.id}`, at: x.at, who: manager?.name ?? 'El agente', whoKind: 'agente', text: `${verb}: ${x.summary || 'una acción'}`, clickupUserId: null, agentKey: manager?.key ?? null });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Actividad de un miembro concreto (para su ficha). */
export function activityOf(items: ActivityItem[], m: Pick<Member, 'name' | 'clickupUserId' | 'agentKey'>): ActivityItem[] {
  return items.filter((i) => (m.agentKey ? i.agentKey === m.agentKey : (m.clickupUserId && i.clickupUserId === m.clickupUserId) || i.who === m.name));
}
