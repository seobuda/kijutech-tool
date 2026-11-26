import 'server-only';

// SEO · Local (tanda 5a): lo que enseña la pestaña Local del proyecto. Solo lectura.
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, clientLocations, projects, seoLocalPlaces, seoLocalSnapshots, type SeoLocalSnapshot } from '@/lib/db/schema';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { host } from '@/lib/seo/expediente/rules';
import { changedFields, FIELD_LABEL, matchesClient, writeReviewLink, type Baseline } from '@/lib/seo/local/ficha-rules';

export type PlaceSnap = Pick<SeoLocalSnapshot, 'title' | 'category' | 'phone' | 'domain' | 'status' | 'rating' | 'votes' | 'isClaimed'> & { takenAt: string; hours: Record<string, string> | null; additionalCategories: string[] };
export type PlaceView = { id: string; role: string; status: string; cid: string; title: string; competitorName: string | null; snap: PlaceSnap | null; changed: string[]; matches: boolean; votesMonth: number | null };

export type LocalView = {
  clientId: string | null;
  client: PlaceView | null;
  proposals: PlaceView[];
  competitors: PlaceView[];
  reviewLink: string | null;
};

const snapOf = (s: SeoLocalSnapshot | undefined): PlaceSnap | null =>
  s ? { title: s.title, category: s.category, phone: s.phone, domain: s.domain, status: s.status, rating: s.rating, votes: s.votes, isClaimed: s.isClaimed, takenAt: s.takenAt.toISOString(), hours: (s.hours as Record<string, string> | null) ?? null, additionalCategories: s.additionalCategories ?? [] } : null;

export async function getLocalView(tenantId: string, projectId: string): Promise<LocalView | null> {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) return null;
  if (!p.clientId) return { clientId: null, client: null, proposals: [], competitors: [], reviewLink: null };
  const places = await db.select().from(seoLocalPlaces).where(and(eq(seoLocalPlaces.tenantId, tenantId), eq(seoLocalPlaces.clientId, p.clientId)));
  const snaps = places.length ? await db.select().from(seoLocalSnapshots).where(inArray(seoLocalSnapshots.placeRowId, places.map((x) => x.id))).orderBy(desc(seoLocalSnapshots.takenAt)) : [];
  const comps = await db.select({ id: clientCompetitors.id, name: clientCompetitors.name }).from(clientCompetitors).where(eq(clientCompetitors.clientId, p.clientId));
  const domain = host(await projectWebUrl(tenantId, projectId));
  const phones = (await db.select({ phone: clientLocations.phone }).from(clientLocations).where(eq(clientLocations.clientId, p.clientId))).map((l) => l.phone ?? '').filter(Boolean);
  const view = (pl: (typeof places)[number]): PlaceView => {
    const mine = snaps.filter((s) => s.placeRowId === pl.id);
    const last = mine[0];
    const base = pl.baseline as Baseline | null;
    const changed = base && last ? changedFields(base, { title: last.title, category: last.category, phone: last.phone, domain: last.domain, hours: (last.hours as Record<string, string> | null) ?? null }).map((f) => FIELD_LABEL[f]) : [];
    // Reseñas nuevas al mes (aproximado: diferencia con la foto de hace ~30 días o más).
    const old = mine.find((s) => last && last.takenAt.getTime() - s.takenAt.getTime() >= 25 * 86_400_000);
    const days = old && last ? (last.takenAt.getTime() - old.takenAt.getTime()) / 86_400_000 : 0;
    const votesMonth = old && last && last.votes !== null && old.votes !== null && days > 0 ? Math.round(((last.votes - old.votes) / days) * 30) : null;
    return {
      id: pl.id,
      role: pl.role,
      status: pl.status,
      cid: pl.cid,
      title: pl.title,
      competitorName: comps.find((c) => c.id === pl.clientCompetitorId)?.name ?? null,
      snap: snapOf(last),
      changed,
      matches: last ? matchesClient({ domain: last.domain, phone: last.phone }, { domains: domain ? [domain] : [], phones }) : false,
      votesMonth
    };
  };
  const client = places.find((x) => x.role === 'cliente' && x.status === 'confirmada');
  return {
    clientId: p.clientId,
    client: client ? view(client) : null,
    proposals: places.filter((x) => x.status === 'propuesta').map(view),
    competitors: places.filter((x) => x.role === 'competidor' && x.status === 'confirmada').map(view),
    reviewLink: client?.placeId ? writeReviewLink(client.placeId) : null
  };
}
