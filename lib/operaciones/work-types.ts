// Tipos de trabajo (cambio web, landing, artículo, Google Ads, mantenimiento, otro…): lista editable
// por cuenta (ops_work_types). Hoy solo son un campo del encargo (la IA lo propone al convertir la
// nota y se puede cambiar); más adelante servirán para elegir revisores automáticos.
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsWorkTypes } from '@/lib/db/schema';

export type WorkTypeOption = { key: string; label: string };

const DEFAULTS: WorkTypeOption[] = [
  { key: 'cambio_web', label: 'Cambio web' },
  { key: 'landing', label: 'Landing' },
  { key: 'articulo', label: 'Artículo' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'mantenimiento', label: 'Mantenimiento' },
  { key: 'otro', label: 'Otro' }
];

// Cuentas nuevas (la migración solo siembra las que ya existían).
export async function ensureWorkTypes(tenantId: string): Promise<void> {
  const [any] = await db.select({ id: opsWorkTypes.id }).from(opsWorkTypes).where(eq(opsWorkTypes.tenantId, tenantId)).limit(1);
  if (any) return;
  await db
    .insert(opsWorkTypes)
    .values(DEFAULTS.map((d, i) => ({ tenantId, key: d.key, label: d.label, sortOrder: i + 1 })))
    .onConflictDoNothing();
}

export async function getWorkTypes(tenantId: string, includeInactive = false) {
  await ensureWorkTypes(tenantId);
  const rows = await db
    .select()
    .from(opsWorkTypes)
    .where(
      includeInactive
        ? eq(opsWorkTypes.tenantId, tenantId)
        : and(eq(opsWorkTypes.tenantId, tenantId), eq(opsWorkTypes.active, true))
    )
    .orderBy(asc(opsWorkTypes.sortOrder), asc(opsWorkTypes.label));
  return rows;
}

export async function getWorkTypeOptions(tenantId: string): Promise<WorkTypeOption[]> {
  return (await getWorkTypes(tenantId)).map((t) => ({ key: t.key, label: t.label }));
}

// Clave válida (activa) o null.
export async function validWorkTypeKey(tenantId: string, key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  const opts = await getWorkTypeOptions(tenantId);
  return opts.some((o) => o.key === key) ? key : null;
}

export const slugKey = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
