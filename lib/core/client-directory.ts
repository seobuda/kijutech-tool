import 'server-only';

// Propiedades de las integraciones conectadas (hoy Google: Search Console, Analytics 4 y Business Profile) para
// asignarlas a las fichas de cliente (15 nov 2026). El núcleo no sabe de Google: pregunta a los directorios que los
// módulos registran (lib/core/capabilities.ts → registerAssetDirectory).
//   - directoryAssets: lo que ve cada integración (caché de 5 minutos por cuenta).
//   - suggestAssets: las que coinciden con el dominio de las webs del cliente y aún no están en su ficha (sin IA).
//   - addDirectoryAssets: añade a la ficha las elegidas (solo si de verdad están en la integración).
//   - checkAccess: marca «Tenemos acceso» / «Sin acceso» según aparezcan o no en la integración.
import { assetDirectories } from '@/lib/core/capabilities';
import { ClientError, getClientSheet, saveAsset } from '@/lib/core/clients';
import { ASSET_KIND_LABEL, accessFromDirectory, assetKey, domainOf, isAssetKind, matchExternalAssets, type AssetKind, type ExternalAsset } from '@/lib/core/client-rules';

export type DirectoryResult = { connected: boolean; assets: ExternalAsset[]; okKinds: string[]; errors: string[] };

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; data: DirectoryResult }>();

/** Solo para las pruebas. */
export function _resetDirectoryCache(): void {
  cache.clear();
}

export async function directoryAssets(tenantId: string, opts: { fresh?: boolean } = {}): Promise<DirectoryResult> {
  const hit = cache.get(tenantId);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL) return hit.data;
  const out: DirectoryResult = { connected: false, assets: [], okKinds: [], errors: [] };
  for (const d of assetDirectories()) {
    if (!(await d.isConnected(tenantId).catch(() => false))) continue;
    out.connected = true;
    try {
      const r = await d.list(tenantId);
      for (const a of r.assets) if (isAssetKind(a.kind)) out.assets.push({ ...a, kind: a.kind });
      out.okKinds.push(...r.okKinds);
      out.errors.push(...r.errors);
    } catch (e) {
      console.error(`[clientes] directorio ${d.provider}:`, e instanceof Error ? e.message : e);
      out.errors.push(`${d.provider}: no se pudo consultar`);
    }
  }
  cache.set(tenantId, { at: Date.now(), data: out });
  return out;
}

/** Tipos de cuenta que alguna integración registrada sabe listar (aunque no esté conectada). */
export function directoryKinds(): AssetKind[] {
  return [...new Set(assetDirectories().flatMap((d) => d.kinds))].filter(isAssetKind);
}

const WEB_KINDS = new Set(['web', 'dominio', 'tienda', 'search_console']);

export async function suggestAssets(tenantId: string, clientId: string): Promise<DirectoryResult & { suggestions: ExternalAsset[]; domains: string[] }> {
  const sheet = await getClientSheet(tenantId, clientId);
  if (!sheet) throw new ClientError('Ese cliente no existe.');
  const domains = [...new Set(sheet.assets.filter((a) => WEB_KINDS.has(a.kind)).map((a) => domainOf(a.value)).filter((d): d is string => Boolean(d)))];
  const dir = await directoryAssets(tenantId, { fresh: true });
  return { ...dir, domains, suggestions: matchExternalAssets(domains, dir.assets, sheet.assets) };
}

const today = () => new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });

/** Añade a la ficha las propiedades elegidas. Solo las que la integración ve de verdad (no se fía del navegador). */
export async function addDirectoryAssets(tenantId: string, clientId: string, picks: { kind: string; value: string }[]): Promise<{ added: string[]; skipped: number }> {
  const sheet = await getClientSheet(tenantId, clientId);
  if (!sheet) throw new ClientError('Ese cliente no existe.');
  const dir = await directoryAssets(tenantId);
  const have = new Set(sheet.assets.map((a) => `${a.kind}|${assetKey(a.kind, a.value)}`));
  const added: string[] = [];
  let skipped = 0;
  for (const p of picks.slice(0, 30)) {
    const x = dir.assets.find((a) => a.kind === p.kind && assetKey(a.kind, a.value) === assetKey(p.kind, p.value));
    const key = `${p.kind}|${assetKey(p.kind, p.value)}`;
    if (!x || have.has(key)) {
      skipped++;
      continue;
    }
    await saveAsset(tenantId, clientId, { kind: x.kind, value: x.value, label: x.label.slice(0, 255), access: 'si', accessNotes: `Comprobado en la cuenta de Google conectada (${today()}).`, recognizeEmails: false });
    have.add(key);
    added.push(`${ASSET_KIND_LABEL[x.kind]}: ${x.label}`);
  }
  return { added, skipped };
}

/**
 * Revisa el acceso de las cuentas de la ficha que una integración sabe listar: «si» si aparece; si no, «no»
 * (salvo «Pedido, pendiente», que se mantiene hasta que aparezca, y «No hace falta», que no se toca).
 */
export async function checkAccess(tenantId: string, clientId: string): Promise<{ yes: string[]; no: string[]; unchanged: number; errors: string[]; connected: boolean }> {
  const sheet = await getClientSheet(tenantId, clientId);
  if (!sheet) throw new ClientError('Ese cliente no existe.');
  const dir = await directoryAssets(tenantId, { fresh: true });
  const res = { yes: [] as string[], no: [] as string[], unchanged: 0, errors: dir.errors, connected: dir.connected };
  if (!dir.connected) return res;
  for (const a of sheet.assets) {
    if (!dir.okKinds.includes(a.kind) || !a.value || a.access === 'no_aplica') continue;
    const found = accessFromDirectory(a.kind, a.value, dir.assets);
    const next = found === 'si' ? 'si' : a.access === 'pendiente' ? 'pendiente' : 'no';
    const name = `${ASSET_KIND_LABEL[a.kind as AssetKind] ?? a.kind}: ${a.label || a.value}`;
    if (found === 'si') res.yes.push(name);
    else res.no.push(name);
    if (next === a.access) {
      res.unchanged++;
      continue;
    }
    await saveAsset(tenantId, clientId, {
      id: a.id,
      access: next,
      accessNotes: found === 'si' ? `Comprobado en la cuenta de Google conectada (${today()}).` : `No aparece en la cuenta de Google conectada (${today()}): pide acceso o revisa el identificador.`
    });
  }
  return res;
}
