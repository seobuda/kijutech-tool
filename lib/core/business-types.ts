// Núcleo: tipos de negocio de schema.org (Hito 1 SEO, 23 nov 2026). PURO, sin imports: lo usan la ficha del cliente
// (clients.business_type), el JSON-LD de SEO y la medición de técnicas por tipo de negocio. Antes vivía en el módulo
// SEO; pasa al núcleo porque el tipo de negocio es un dato del cliente que también usarán Ads y la medición.

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

export const BUSINESS_TYPE_SET = new Set(BUSINESS_TYPES.map((t) => t.value));

export function isBusinessType(v: string | null | undefined): v is string {
  return !!v && BUSINESS_TYPE_SET.has(v);
}

export function businessTypeLabel(v: string | null | undefined): string {
  return BUSINESS_TYPES.find((t) => t.value === v)?.label ?? 'Sin elegir';
}
