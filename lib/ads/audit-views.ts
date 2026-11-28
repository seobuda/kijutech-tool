import 'server-only';

// Módulo Google Ads · datos de la sección «Auditoría de higiene» del expediente de una cuenta (paso 3; diseño §13.7).
// Función interna (no se exporta desde 'use server'): quien la llama ya comprobó el permiso. Sin llamadas a Google.
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import * as aud from '@/lib/ads/audit-store';
import { fichaFor, fichaValue } from '@/lib/ads/audit';
import { auditReportText, factFresh, guionTop, type Prediction } from '@/lib/ads/audit-rules';
import { AUDIT_RESPONSE_LABEL, CONTROL_INFO, FICHA_FACT_LABEL, FICHA_FACTS, type AuditControl, type AuditResponse, type AuditStatus, type FichaFact } from '@/lib/ads/audit-labels';
import { thresholdsOf } from '@/lib/ads/findings';
import { getAccount, getSettingsRow } from '@/lib/ads/store';

export type AuditItemView = {
  id: string;
  control: string;
  label: string;
  capability: string;
  tanda: number;
  risk: string;
  status: AuditStatus;
  initialStatus: AuditStatus;
  needsConfirmation: boolean;
  title: string;
  lines: string[];
  todo: string[];
  reason: string | null;
  uncheckedReason: string | null;
  exposure: number | null;
  currency: string | null;
  prediction: Prediction | null;
  fixedAt: string | null;
  regressedAt: string | null;
  regressionCount: number;
  regressionCause: string | null;
  response: AuditResponse | null;
  responseLabel: string | null;
  responseReason: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  checkedAt: string;
};

export type AuditView = {
  audit: { id: string; createdAt: string; createdBy: string | null; dataThrough: string | null; readAt: string | null; readBy: string | null; baseline: Record<string, unknown>; previous: number } | null;
  items: AuditItemView[];
  top: AuditItemView[];
  counts: { bien: number; mal: number; confirmar: number; noComprobado: number; regressed: number };
  ownershipPending: boolean;
  ficha: { source: 'ficha' | 'simulada'; clientId: string | null; months: number; facts: { fact: FichaFact; label: string; value: string; confirmedAt: string | null; fresh: boolean }[] } | null;
  report: string;
  data: { kind: string; ok: boolean; error: string | null; syncedAt: string }[];
};

const str = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export async function auditView(tenantId: string, accountId: string, now: Date = new Date()): Promise<AuditView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return null;
  const acc = await getAccount(tenantId, accountId);
  if (!acc) return null;
  const settings = await getSettingsRow(tenantId);
  const t = thresholdsOf(settings);
  const audit = await aud.currentAudit(tenantId, accountId);
  const rows = audit ? await aud.listItems(tenantId, audit.id) : [];
  const ids = [...new Set([...rows.map((r) => r.respondedBy), audit?.createdBy, audit?.readBy].filter((x): x is number => typeof x === 'number'))];
  const names = new Map(ids.length ? (await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name || u.email]) : []);
  const items: AuditItemView[] = rows
    .map((r) => {
      const ev = (r.evidence ?? {}) as Record<string, unknown>;
      const info = CONTROL_INFO[r.control as AuditControl];
      return {
        id: r.id,
        control: r.control,
        label: info?.label ?? r.control,
        capability: info?.capability ?? '',
        tanda: r.tanda,
        risk: r.risk,
        status: r.status as AuditStatus,
        initialStatus: r.initialStatus as AuditStatus,
        needsConfirmation: r.needsConfirmation,
        title: r.title,
        lines: str(ev.lines),
        todo: str(ev.todo),
        reason: typeof ev.reason === 'string' ? ev.reason : null,
        uncheckedReason: typeof ev.uncheckedReason === 'string' ? ev.uncheckedReason : null,
        exposure: r.exposure === null ? null : Number(r.exposure),
        currency: r.currency,
        prediction: (r.prediction as Prediction | null) ?? null,
        fixedAt: r.fixedAt?.toISOString() ?? null,
        regressedAt: r.regressedAt?.toISOString() ?? null,
        regressionCount: r.regressionCount,
        regressionCause: r.regressionCause,
        response: (r.response as AuditResponse | null) ?? null,
        responseLabel: r.response ? (AUDIT_RESPONSE_LABEL[r.response as AuditResponse] ?? r.response) : null,
        responseReason: r.responseReason,
        respondedAt: r.respondedAt?.toISOString() ?? null,
        respondedBy: r.respondedBy ? (names.get(r.respondedBy) ?? null) : null,
        checkedAt: r.checkedAt.toISOString()
      };
    })
    .sort((x, y) => x.tanda - y.tanda || (Object.keys(CONTROL_INFO).indexOf(x.control) - Object.keys(CONTROL_INFO).indexOf(y.control)));
  // Los 3 del guion: lo que reapareció primero; «regressedAt» solo cuenta si sigue mal.
  const top = guionTop(items.map((i) => ({ ...i, regressedAt: i.regressedAt && i.status === 'mal' ? new Date(i.regressedAt) : null }))).map((x) => items.find((i) => i.id === x.id)!);
  const f = await fichaFor(tenantId, acc, now);
  const previous = audit ? (await aud.listAudits(tenantId, accountId)).length - 1 : 0;
  const counts = {
    bien: items.filter((i) => i.status === 'bien').length,
    mal: items.filter((i) => i.status === 'mal' && !i.needsConfirmation).length,
    confirmar: items.filter((i) => i.status === 'mal' && i.needsConfirmation).length,
    noComprobado: items.filter((i) => i.status === 'no_comprobado').length,
    regressed: items.filter((i) => i.status === 'mal' && i.regressedAt).length
  };
  return {
    audit: audit
      ? {
          id: audit.id,
          createdAt: audit.createdAt.toISOString(),
          createdBy: audit.createdBy ? (names.get(audit.createdBy) ?? null) : null,
          dataThrough: audit.dataThrough,
          readAt: audit.readAt?.toISOString() ?? null,
          readBy: audit.readBy ? (names.get(audit.readBy) ?? null) : null,
          baseline: audit.baseline ?? {},
          previous
        }
      : null,
    items,
    top,
    counts,
    ownershipPending: items.some((i) => i.control === 'propiedad_accesos' && i.response !== 'hecho'),
    ficha: f
      ? {
          source: f.source,
          clientId: acc.clientId,
          months: t.fichaMesesFrescura,
          facts: FICHA_FACTS.map((fact) => ({ fact, label: FICHA_FACT_LABEL[fact], value: fichaValue(f, fact), confirmedAt: f.confirmed[fact]?.toISOString() ?? null, fresh: factFresh(f, fact, now, t.fichaMesesFrescura) }))
        }
      : null,
    report: audit ? auditReportText({ accountName: acc.name ?? acc.customerId, date: audit.createdAt.toISOString().slice(0, 10), currency: acc.currency, items: items.map((i) => ({ control: i.control, status: i.status, needsConfirmation: i.needsConfirmation, title: i.title, lines: i.lines, todo: i.todo, exposure: i.exposure, response: i.responseLabel })) }) : '',
    data: (await aud.auditDataRows(tenantId, accountId)).map((d) => ({ kind: d.kind, ok: d.ok, error: d.error, syncedAt: d.syncedAt.toISOString() }))
  };
}
