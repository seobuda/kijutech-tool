// SEO · Salud técnica: generador de datos estructurados (JSON-LD) a partir de la ficha del cliente (Hito 1, 23 nov 2026;
// docs/DISENO-MODULO-SEO.md §5: «el código JSON-LD listo para pegar, por plantillas y con los datos verificados de la
// ficha»). PURO y sin IA: plantillas fijas rellenadas con datos de la ficha (clients, client_locations, client_assets).
// Nunca genera FAQPage (Google dejó de mostrarlo para casi todas las webs) ni reseñas o valoraciones del propio negocio
// (Google no las admite). Lo que falta en la ficha no se inventa: se avisa en `missing` para completarlo.

/** Subtipos de schema.org más habituales en nuestros clientes. El de la ficha lo elige una persona (o, más adelante, la IA lo propone). */
export const BUSINESS_TYPES: { value: string; label: string }[] = [
  { value: 'LocalBusiness', label: 'Negocio local (genérico)' },
  { value: 'Organization', label: 'Empresa sin atención al público' },
  { value: 'ProfessionalService', label: 'Servicio profesional' },
  { value: 'HomeAndConstructionBusiness', label: 'Reformas y construcción' },
  { value: 'GeneralContractor', label: 'Contratista general' },
  { value: 'Electrician', label: 'Electricista' },
  { value: 'Plumber', label: 'Fontanero' },
  { value: 'HVACBusiness', label: 'Climatización' },
  { value: 'RoofingContractor', label: 'Tejados y cubiertas' },
  { value: 'AutomotiveBusiness', label: 'Automoción' },
  { value: 'AutoRepair', label: 'Taller mecánico' },
  { value: 'HealthAndBeautyBusiness', label: 'Salud y belleza' },
  { value: 'BeautySalon', label: 'Salón de belleza' },
  { value: 'HairSalon', label: 'Peluquería' },
  { value: 'Dentist', label: 'Dentista' },
  { value: 'MedicalClinic', label: 'Clínica médica' },
  { value: 'Physiotherapy', label: 'Fisioterapia' },
  { value: 'SportsActivityLocation', label: 'Actividad deportiva' },
  { value: 'ExerciseGym', label: 'Gimnasio' },
  { value: 'LegalService', label: 'Servicios legales' },
  { value: 'Attorney', label: 'Abogado' },
  { value: 'AccountingService', label: 'Asesoría contable' },
  { value: 'RealEstateAgent', label: 'Inmobiliaria' },
  { value: 'Restaurant', label: 'Restaurante' },
  { value: 'CafeOrCoffeeShop', label: 'Cafetería' },
  { value: 'Store', label: 'Tienda' },
  { value: 'LodgingBusiness', label: 'Alojamiento' },
  { value: 'EducationalOrganization', label: 'Centro de formación' },
  { value: 'TravelAgency', label: 'Agencia de viajes' }
];
const TYPE_SET = new Set(BUSINESS_TYPES.map((t) => t.value));

export type JsonLdClient = {
  name: string;
  legalName: string | null;
  summary: string | null;
  logoUrl: string | null;
};
export type JsonLdLocation = {
  name: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  isPrimary: boolean;
};
export type JsonLdInput = {
  client: JsonLdClient;
  webUrl: string | null;
  businessType: string;
  locations: JsonLdLocation[];
  /** URLs de perfiles sociales (Instagram, Facebook, LinkedIn, YouTube, TikTok…) de la ficha. */
  socials: string[];
};
export type JsonLdBlock = { key: string; title: string; where: string; code: string };
export type JsonLdOutput = { blocks: JsonLdBlock[]; missing: string[] };

const COUNTRY: Record<string, string> = { españa: 'ES', spain: 'ES', es: 'ES', portugal: 'PT', pt: 'PT', francia: 'FR', france: 'FR', andorra: 'AD', méxico: 'MX', mexico: 'MX' };
export function countryCode(c: string | null): string | null {
  if (!c?.trim()) return null;
  const v = c.trim().toLowerCase();
  return COUNTRY[v] ?? (/^[a-z]{2}$/i.test(v) ? v.toUpperCase() : c.trim());
}

/** Teléfono en formato internacional si es un número español de 9 cifras sin prefijo. */
export function normalizePhone(p: string | null): string | null {
  if (!p?.trim()) return null;
  const digits = p.replace(/[^\d+]/g, '');
  if (/^[6789]\d{8}$/.test(digits)) return `+34${digits}`;
  if (/^0034\d{9}$/.test(digits)) return `+${digits.slice(2)}`;
  return digits || p.trim();
}

function origin(u: string | null): string | null {
  if (!u?.trim()) return null;
  try {
    const x = new URL(/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
    return `${x.protocol}//${x.host}/`;
  } catch {
    return null;
  }
}

const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))) as T;
const script = (obj: unknown) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;

function address(l: JsonLdLocation) {
  if (!l.address && !l.city) return null;
  return clean({ '@type': 'PostalAddress', streetAddress: l.address?.trim() || null, addressLocality: l.city?.trim() || null, postalCode: l.postalCode?.trim() || null, addressRegion: l.region?.trim() || null, addressCountry: countryCode(l.country) });
}

/** Genera los bloques. El primero (negocio + web) va en todas las páginas; uno por sede adicional, en la página de cada sede. */
export function buildJsonLd(input: JsonLdInput): JsonLdOutput {
  const missing: string[] = [];
  const site = origin(input.webUrl);
  const type = TYPE_SET.has(input.businessType) ? input.businessType : 'LocalBusiness';
  const isOrg = type === 'Organization';
  const name = input.client.name.trim();
  if (!site) missing.push('La web del cliente (Webs y cuentas): sin ella no hay «url» ni identificadores.');
  if (!input.client.logoUrl) missing.push('El logo (Empresa y negocio → logo): Google lo usa en el panel de la marca.');
  const sorted = [...input.locations].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const primary = sorted[0] ?? null;
  if (!isOrg) {
    if (!primary) missing.push('Al menos un local con dirección y teléfono (Locales): un negocio local sin dirección no sirve para Google Maps.');
    else {
      if (!primary.address || !primary.city) missing.push('La dirección completa del local principal (calle y población).');
      if (!primary.phone) missing.push('El teléfono del local principal.');
      if (!primary.postalCode) missing.push('El código postal del local principal.');
    }
  }
  if (!input.socials.length) missing.push('Los perfiles sociales (Webs y cuentas): van en «sameAs» y ayudan a Google a unir la marca.');

  const orgId = site ? `${site}#organizacion` : undefined;
  const business = clean({
    '@type': type,
    '@id': orgId,
    name,
    legalName: input.client.legalName?.trim() || null,
    url: site,
    logo: input.client.logoUrl || null,
    image: input.client.logoUrl || null,
    description: input.client.summary?.trim().slice(0, 300) || null,
    ...(isOrg || !primary
      ? { telephone: normalizePhone(primary?.phone ?? null) }
      : { address: address(primary), telephone: normalizePhone(primary.phone) }),
    sameAs: input.socials
  });
  const website = clean({ '@type': 'WebSite', '@id': site ? `${site}#web` : undefined, url: site, name, inLanguage: 'es', publisher: orgId ? { '@id': orgId } : null });

  const blocks: JsonLdBlock[] = [
    {
      key: 'negocio',
      title: isOrg ? 'Empresa y web' : 'Negocio y web',
      where: 'En todas las páginas (en el <head> o al final del <body>; en WordPress, con el plugin de SEO o un bloque de código global).',
      code: script({ '@context': 'https://schema.org', '@graph': [business, website] })
    }
  ];
  if (!isOrg) {
    for (const [i, l] of sorted.slice(1).entries()) {
      const a = address(l);
      if (!a) continue;
      blocks.push({
        key: `local-${i + 2}`,
        title: `Local: ${l.name?.trim() || l.city?.trim() || `sede ${i + 2}`}`,
        where: 'Solo en la página de ese local (si no tiene página propia, conviene crearla).',
        code: script(
          clean({
            '@context': 'https://schema.org',
            '@type': type,
            name: l.name?.trim() ? `${name} ${l.name.trim()}` : name,
            url: site,
            parentOrganization: orgId ? { '@id': orgId } : null,
            address: a,
            telephone: normalizePhone(l.phone)
          })
        )
      });
    }
  }
  return { blocks, missing };
}
