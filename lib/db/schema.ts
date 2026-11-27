import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  decimal,
  unique,
  check,
  index,
  uniqueIndex,
  customType,
  bigint,
  bigserial,
  doublePrecision,
  real,
  primaryKey,
  smallint,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: varchar('plan', { length: 20 }).notNull().default('internal'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  aiKeyModeAllowed: varchar('ai_key_mode_allowed', { length: 20 })
    .notNull()
    .default('platform_only'),
  // Comunicaciones con clientes (cimientos, 23 nov 2026): por defecto, todo lo que sale hacia un cliente pasa por la
  // aprobación del dueño. siempre | nunca. Cada cliente puede heredarlo o fijar el suyo (clients.comms_approval).
  commsApprovalDefault: varchar('comms_approval_default', { length: 10 }).notNull().default('siempre'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  description: text('description'),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: varchar('name', { length: 200 }).notNull(),
  clientName: varchar('client_name', { length: 200 }),
  domain: varchar('domain', { length: 255 }),
  location: varchar('location', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  // Cliente del núcleo al que pertenece el proyecto (14 nov 2026). Obligatorio desde los cimientos (23 nov 2026, CHECK
  // de la migración 0060): solo los proyectos que ya existían sin cliente (legacy) pueden seguir sin él.
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  legacy: boolean('legacy').notNull().default(false),
  // Servicio del proyecto: seo | ads | web | otro. Un cliente puede tener varios proyectos.
  service: varchar('service', { length: 20 }).notNull().default('seo'),
  // Horas al mes del proyecto (las reparte el estratega). Sin valor, se usan las del cliente.
  monthlyHours: decimal('monthly_hours', { precision: 6, scale: 1 }),
  // Resumen del expediente (el detalle vive en el módulo del servicio).
  brief: jsonb('brief'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
});

// --- Cliente (NÚCLEO, 14 nov 2026; docs/DISENO-FICHA-CLIENTE.md) ------------------------------------------------
// La ficha completa del cliente: la ven todos los módulos. Operaciones guarda sus ajustes en ops_clients (mismo id).
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    // prospecto | onboarding | activo | pausado | baja
    status: varchar('status', { length: 20 }).notNull().default('activo'),
    sector: varchar('sector', { length: 120 }),
    summary: text('summary'),
    logoUrl: varchar('logo_url', { length: 500 }),
    legalName: varchar('legal_name', { length: 255 }),
    taxId: varchar('tax_id', { length: 30 }),
    fiscalAddress: text('fiscal_address'),
    business: text('business'),
    offerings: text('offerings'),
    area: varchar('area', { length: 255 }),
    audience: text('audience'),
    valueProposition: text('value_proposition'),
    brandTone: text('brand_tone'),
    goals: text('goals'),
    strategy: text('strategy'),
    notes: text('notes'),
    // Contrato: solo lo ven y editan los administradores.
    contractServices: text('contract_services'),
    monthlyFee: decimal('monthly_fee', { precision: 10, scale: 2 }),
    contractStart: date('contract_start'),
    contractRenewal: date('contract_renewal'),
    startedAt: date('started_at'),
    endedAt: date('ended_at'),
    endReason: text('end_reason'),
    // Comunicaciones (23 nov 2026): heredar (lo de la cuenta) | siempre (pasan por aprobación) | nunca.
    commsApproval: varchar('comms_approval', { length: 10 }).notNull().default('heredar'),
    // Tipo de negocio de schema.org (p. ej. «HomeAndConstructionBusiness»), 23 nov 2026, migración 0061. Es del cliente,
    // no de un módulo: lo usan el JSON-LD de SEO, la medición de técnicas (por tipo de negocio) y, después, Ads.
    businessType: varchar('business_type', { length: 60 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('clients_tenant_idx').on(table.tenantId, table.status),
    check('clients_status_check', sql`${table.status} IN ('prospecto', 'onboarding', 'activo', 'pausado', 'baja')`),
    check('clients_comms_approval_check', sql`${table.commsApproval} IN ('heredar', 'siempre', 'nunca')`),
  ]
);
export type Client = typeof clients.$inferSelect;

// Personas del cliente. Sus correos sirven para reconocer de qué cliente es un email (un correo, un cliente).
export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    jobTitle: varchar('job_title', { length: 120 }),
    // decisor | facturacion | tecnico | marketing | otro
    role: varchar('role', { length: 20 }).notNull().default('otro'),
    // Siempre en minúsculas.
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 40 }),
    whatsapp: varchar('whatsapp', { length: 40 }),
    // email | telefono | whatsapp | otro
    preferredChannel: varchar('preferred_channel', { length: 20 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('client_contacts_client_idx').on(table.clientId),
    uniqueIndex('client_contacts_email_unique').on(table.tenantId, table.email).where(sql`${table.email} IS NOT NULL`),
    check('client_contacts_role_check', sql`${table.role} IN ('decisor', 'facturacion', 'tecnico', 'marketing', 'otro')`),
    check('client_contacts_channel_check', sql`${table.preferredChannel} IS NULL OR ${table.preferredChannel} IN ('email', 'telefono', 'whatsapp', 'otro')`),
  ]
);
export type ClientContact = typeof clientContacts.$inferSelect;

export const clientLocations = pgTable(
  'client_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }),
    address: text('address'),
    city: varchar('city', { length: 120 }),
    postalCode: varchar('postal_code', { length: 20 }),
    region: varchar('region', { length: 120 }),
    country: varchar('country', { length: 80 }),
    phone: varchar('phone', { length: 40 }),
    hours: text('hours'),
    isPrimary: boolean('is_primary').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('client_locations_client_idx').on(table.clientId)]
);
export type ClientLocation = typeof clientLocations.$inferSelect;

// Webs, dominios y cuentas del cliente. NUNCA contraseñas: solo dónde están los accesos.
export const clientAssets = pgTable(
  'client_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 30 }).notNull(),
    label: varchar('label', { length: 255 }),
    // URL o identificador externo (p. ej. «sc-domain:cliente.com», «properties/123»).
    value: varchar('value', { length: 500 }),
    // sin_revisar | si | pendiente | no | no_aplica
    access: varchar('access', { length: 20 }).notNull().default('sin_revisar'),
    accessNotes: text('access_notes'),
    isPrimary: boolean('is_primary').notNull().default(false),
    // Dominio cuyos correos son de este cliente (null = no reconoce correos). Único por cuenta.
    emailDomain: varchar('email_domain', { length: 255 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('client_assets_client_idx').on(table.clientId),
    uniqueIndex('client_assets_email_domain_unique').on(table.tenantId, table.emailDomain).where(sql`${table.emailDomain} IS NOT NULL`),
    // mapa_contenido (20 nov 2026): enlace al Google Sheet del mapa de contenidos SEO del cliente (lo lleva Mayi).
    check('client_assets_kind_check', sql`${table.kind} IN ('web', 'dominio', 'search_console', 'analytics', 'business_profile', 'google_ads', 'meta', 'instagram', 'tiktok', 'linkedin', 'youtube', 'tienda', 'crm', 'mapa_contenido', 'otro')`),
    check('client_assets_access_check', sql`${table.access} IN ('sin_revisar', 'si', 'pendiente', 'no', 'no_aplica')`),
  ]
);
export type ClientAsset = typeof clientAssets.$inferSelect;

export const clientCompetitors = pgTable(
  'client_competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 255 }),
    notes: text('notes'),
    // manual | agente | serp (buscador orgánico) | local (paquete local de Google), Hito 2 SEO (0062)
    source: varchar('source', { length: 12 }).notNull().default('manual'),
    // Hito 2 SEO (24 nov 2026, migración 0062): competencia por proyecto, propuesta por la búsqueda y confirmada por una
    // persona. Lo manual o del agente entra confirmado; lo que detecta la búsqueda, propuesto.
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    // propuesto | confirmado | descartado
    status: varchar('status', { length: 12 }).notNull().default('confirmado'),
    // directo | agregador (directorios, marketplaces) | medio
    kind: varchar('kind', { length: 12 }).notNull().default('directo'),
    // { consultas: [...], apariciones, posicionMedia, enPaqueteLocal, … }
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    lastSeen: timestamp('last_seen'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('client_competitors_client_idx').on(table.clientId),
    index('client_competitors_project_idx').on(table.projectId, table.status),
    check('client_competitors_source_check', sql`${table.source} IN ('manual', 'agente', 'serp', 'local')`),
    check('client_competitors_status_check', sql`${table.status} IN ('propuesto', 'confirmado', 'descartado')`),
    check('client_competitors_kind_check', sql`${table.kind} IN ('directo', 'agregador', 'medio')`),
  ]
);
export type ClientCompetitor = typeof clientCompetitors.$inferSelect;

// --- Base de conocimiento (NÚCLEO, 20 nov 2026; diseño docs/DISENO-JEFE-OPERACIONES.md) -----------------------------
// Lo que la agencia sabe hacer y resolver. La usan el jefe de Operaciones (dudas del equipo) y el resto de agentes.
// Solo Enric publica: el equipo envía solicitudes, la IA las redacta y él aprueba, edita o deja «para más tarde».

export const kbCategories = pgTable(
  'kb_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique('kb_categories_tenant_key_unique').on(table.tenantId, table.key)]
);
export type KbCategory = typeof kbCategories.$inferSelect;

export const kbArticles = pgTable(
  'kb_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => kbCategories.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    // La pregunta o el síntoma («El cliente dice que su web va lenta») y la solución (pasos, con formato Markdown).
    problem: text('problem').notNull().default(''),
    solution: text('solution').notNull().default(''),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    // Enlaces y vídeos: [{ title, url }].
    links: jsonb('links').notNull().default([]),
    // borrador (Enric la escribe) | propuesta (espera su revisión) | mas_tarde (cola para sus horas de conocimiento) |
    // publicada (la usan los agentes) | archivada
    status: varchar('status', { length: 12 }).notNull().default('borrador'),
    // manual | equipo (solicitud de un miembro) | respuesta (de Enric a una duda) | clickup (importada) | dictado | agente
    sourceType: varchar('source_type', { length: 12 }).notNull().default('manual'),
    sourceId: varchar('source_id', { length: 100 }),
    sourceUrl: varchar('source_url', { length: 500 }),
    // Solicitudes del equipo: quién la pidió y el texto tal cual lo escribió.
    requestedByName: varchar('requested_by_name', { length: 255 }),
    requestedByUserId: integer('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    requestText: text('request_text'),
    // Aprender de las correcciones: la primera versión de la IA y cada indicación de Enric al pedir otra versión.
    aiDraft: jsonb('ai_draft'),
    editNotes: jsonb('edit_notes').notNull().default([]),
    // Chat de Telegram en el que Enric pulsó «Cambiar»: su siguiente mensaje es la indicación para la IA.
    awaitingChatId: varchar('awaiting_chat_id', { length: 40 }),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingModel: varchar('embedding_model', { length: 80 }),
    embeddedAt: timestamp('embedded_at'),
    timesUsed: integer('times_used').notNull().default(0),
    helpfulCount: integer('helpful_count').notNull().default(0),
    notHelpfulCount: integer('not_helpful_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at'),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('kb_articles_status_idx').on(table.tenantId, table.status, table.updatedAt),
    // Importar dos veces lo mismo (ClickUp) no duplica.
    uniqueIndex('kb_articles_source_unique').on(table.tenantId, table.sourceType, table.sourceId).where(sql`${table.sourceId} IS NOT NULL`),
    // Búsqueda por palabras en español.
    index('kb_articles_fts_idx').using(
      'gin',
      sql`to_tsvector('spanish', coalesce(${table.title}, '') || ' ' || coalesce(${table.problem}, '') || ' ' || coalesce(${table.solution}, ''))`
    ),
    check('kb_articles_status_check', sql`${table.status} IN ('borrador', 'propuesta', 'mas_tarde', 'publicada', 'archivada')`),
    check('kb_articles_source_check', sql`${table.sourceType} IN ('manual', 'equipo', 'respuesta', 'clickup', 'dictado', 'agente')`),
  ]
);
export type KbArticle = typeof kbArticles.$inferSelect;

export const aiProviderSettings = pgTable(
  'ai_provider_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    apiKeyEncrypted: text('api_key_encrypted'),
    apiKeyIv: text('api_key_iv'),
    model: varchar('model', { length: 100 }).notNull(),
    isActive: boolean('is_active').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    keyMode: varchar('key_mode', { length: 20 }).notNull().default('platform'),
    // Proveedor/modelo/key de embeddings, independientes del proveedor de
    // chat de esta fila. embeddingProvider null → usa el mismo proveedor
    // (y su apiKeyEncrypted) también para embeddings; ver getEmbeddingConfig()
    // en lib/ai/gateway.ts.
    embeddingApiKeyEncrypted: text('embedding_api_key_encrypted'),
    embeddingApiKeyIv: text('embedding_api_key_iv'),
    embeddingProvider: varchar('embedding_provider', { length: 20 }),
    embeddingModel: varchar('embedding_model', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique().on(table.tenantId, table.provider)]
);

export const aiModelPricing = pgTable(
  'ai_model_pricing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 20 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    inputCostPer1k: decimal('input_cost_per_1k', { precision: 10, scale: 6 })
      .notNull()
      .default('0'),
    outputCostPer1k: decimal('output_cost_per_1k', { precision: 10, scale: 6 })
      .notNull()
      .default('0'),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    effectiveTo: date('effective_to'),
  },
  (table) => [unique().on(table.provider, table.model, table.effectiveFrom)]
);

export const aiJobs = pgTable('ai_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  function: varchar('function', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('processing'),
  input: jsonb('input').notNull().default({}),
  output: jsonb('output'),
  error: text('error'),
  provider: varchar('provider', { length: 20 }),
  model: varchar('model', { length: 100 }),
  keyModeUsed: varchar('key_mode_used', { length: 20 }),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  estimatedCost: decimal('estimated_cost', { precision: 10, scale: 6 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  // D4 (19 nov 2026): el vigía de IA y Salud la recorren por cuenta y fecha cada pocos minutos.
  index('ai_jobs_tenant_created_idx').on(table.tenantId, table.createdAt),
]);

export const aiPrompts = pgTable('ai_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  userPromptTemplate: text('user_prompt_template').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

// Exámenes de prompts (22 nov 2026, aprobado por Enric): cada pasada de la batería de referencia de un prompt desde el
// panel (IA → Prompts → el prompt). Guarda la nota, con qué versión se pasó y qué casos fallaron, para ver si un prompt
// empeora con el tiempo. `draft` = se examinó el borrador del formulario sin guardarlo (prompt_version null).
export const aiPromptEvals = pgTable('ai_prompt_evals', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptKey: varchar('prompt_key', { length: 100 }).notNull(),
  promptVersion: integer('prompt_version'),
  draft: boolean('draft').notNull().default(false),
  // Cuenta cuyos datos (clientes, miembros, caché de ClickUp) se usaron para construir los casos; paga la IA.
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('en_curso'), // en_curso | ok | error
  passedChecks: integer('passed_checks').notNull().default(0),
  totalChecks: integer('total_checks').notNull().default(0),
  minScorePct: integer('min_score_pct').notNull().default(100),
  passed: boolean('passed'),
  // { cases: [{ key, checks: [{ name, pass, detail }] }], skipped: string[] }
  result: jsonb('result').notNull().default({}),
  error: text('error'),
  costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
  startedBy: integer('started_by').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  finishedAt: timestamp('finished_at'),
}, (table) => [
  index('ai_prompt_evals_key_started_idx').on(table.promptKey, table.startedAt),
  check('ai_prompt_evals_status_check', sql`${table.status} IN ('en_curso', 'ok', 'error')`),
]);

export const aiClusteringExamples = pgTable('ai_clustering_examples', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  keywords: jsonb('keywords').notNull(),
  serpSignals: jsonb('serp_signals').notNull().default([]),
  clusterTitle: varchar('cluster_title').notNull(),
  targetUrl: varchar('target_url'),
  searchIntent: varchar('search_intent'),
  contentType: varchar('content_type'),
  destination: varchar('destination'),
  urlType: varchar('url_type'),
  embedding: vector('embedding', { dimensions: 1536 }),
  feedbackType: varchar('feedback_type').notNull().default('confirmed'),
  sourceJobId: uuid('source_job_id').references(() => aiJobs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const aiIntentModifiers = pgTable(
  'ai_intent_modifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modifier: varchar('modifier', { length: 100 }).notNull(),
    effect: varchar('effect', { length: 20 }).notNull(),
    confidence: integer('confidence').notNull().default(70),
    source: varchar('source', { length: 20 }).notNull().default('ai_classified'),
    timesSeen: integer('times_seen').notNull().default(1),
    language: varchar('language', { length: 5 }).notNull().default('es'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique().on(table.modifier, table.language)]
);

export const aiClusteringFeedback = pgTable('ai_clustering_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => aiJobs.id, { onDelete: 'set null' }),
  feedbackType: varchar('feedback_type', { length: 30 }).notNull(),
  originalValue: jsonb('original_value'),
  correctedValue: jsonb('corrected_value'),
  clusterId: uuid('cluster_id').references(() => seoKwClusters.id, { onDelete: 'set null' }),
  keyword: varchar('keyword'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  version: varchar('version', { length: 20 }),
  active: boolean('active').notNull().default(true),
});

export const projectModules = pgTable(
  'project_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    moduleKey: varchar('module_key', { length: 50 })
      .notNull()
      .references(() => modules.key),
    activatedAt: timestamp('activated_at').notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.moduleKey)]
);

export const seoStageProgress = pgTable(
  'seo_stage_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    stageKey: varchar('stage_key', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [unique().on(table.projectId, table.stageKey)]
);

export const seoKnowledgeCards = pgTable('seo_knowledge_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  stageKey: varchar('stage_key', { length: 50 }).notNull(),
  order: integer('order').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  cardType: varchar('card_type', { length: 30 }).notNull(),
  contextKey: varchar('context_key', { length: 100 }),
});

export const seoSettings = pgTable('seo_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value'),
  label: varchar('label', { length: 200 }).notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const seoKickoffAnswers = pgTable(
  'seo_kickoff_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    questionKey: varchar('question_key', { length: 100 }).notNull(),
    answer: text('answer'),
    answeredAt: timestamp('answered_at'),
  },
  (table) => [unique().on(table.projectId, table.questionKey)]
);

export const seoAuditFindings = pgTable(
  'seo_audit_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    area: varchar('area', { length: 100 }).notNull(),
    checkPoint: varchar('check_point', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }),
    finding: text('finding'),
    priority: varchar('priority', { length: 20 }),
    recommendedAction: text('recommended_action'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.area, table.checkPoint)]
);

export const seoOnboardingChecklist = pgTable(
  'seo_onboarding_checklist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    itemKey: varchar('item_key', { length: 50 }).notNull(),
    checked: boolean('checked').notNull().default(false),
    checkedAt: timestamp('checked_at'),
    isCustom: boolean('is_custom').notNull().default(false),
  },
  (table) => [unique().on(table.projectId, table.itemKey)]
);

export const seoKwCompetitors = pgTable('seo_kw_competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  targetKeyword: varchar('target_keyword', { length: 255 }).notNull(),
  position: integer('position'),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const seoKwRaw = pgTable(
  'seo_kw_raw',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 255 }).notNull(),
    monthlyVolume: integer('monthly_volume'),
    assigned: boolean('assigned').notNull().default(false),
    serankingPosition: integer('seranking_position'),
    serankingPrevPosition: integer('seranking_prev_position'),
    serankingDifficulty: integer('seranking_difficulty'),
    serankingUrl: varchar('seranking_url', { length: 500 }),
    serankingSerpFeatures: text('seranking_serp_features'),
    source: varchar('source', { length: 20 }).notNull().default('manual'),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.keyword)]
);

export const seoKwClusters = pgTable('seo_kw_clusters', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  targetUrl: varchar('target_url', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  difficulty: varchar('difficulty', { length: 20 }),
  clientNote: text('client_note'),
  notes: text('notes'),
  urlType: varchar('url_type', { length: 50 }),
  isAiSuggested: boolean('is_ai_suggested').notNull().default(false),
  reasoning: text('reasoning'),
  lowVolume: boolean('low_volume').notNull().default(false),
  destination: varchar('destination', { length: 20 }),
  contentType: varchar('content_type', { length: 30 }),
  searchIntent: varchar('search_intent', { length: 20 }),
  strategyNote: text('strategy_note'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const seoKwClusterKeywords = pgTable('seo_kw_cluster_keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => seoKwClusters.id, { onDelete: 'cascade' }),
  keyword: varchar('keyword', { length: 255 }).notNull(),
  monthlyVolume: integer('monthly_volume'),
  difficulty: integer('difficulty'),
  isPrimary: boolean('is_primary').notNull().default(false),
  pendingVerification: boolean('pending_verification').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Fase D — Bloque 1: URLs top 5 de Google introducidas a mano por keyword
// research para un cluster, con el resultado del scraping (Capa de
// competitor-scraper.ts). El análisis IA sobre estos datos (Parte 2) vive
// en seoCompetitorAnalysis, no aquí.
export const seoClusterCompetitors = pgTable(
  'seo_cluster_competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clusterId: uuid('cluster_id')
      .notNull()
      .references(() => seoKwClusters.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    position: integer('position').notNull(),
    scrapedAt: timestamp('scraped_at'),
    scrapeStatus: varchar('scrape_status', { length: 20 }).notNull().default('pending'),
    rawScrapedData: jsonb('raw_scraped_data'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [check('position_range', sql`${table.position} BETWEEN 1 AND 5`)]
);

// Resultado del análisis IA (Parte 2, todavía no implementada) sobre las
// seoClusterCompetitors ya scrapeadas de un cluster.
export const seoCompetitorAnalysis = pgTable('seo_competitor_analysis', {
  id: uuid('id').primaryKey().defaultRandom(),
  clusterId: uuid('cluster_id')
    .notNull()
    .references(() => seoKwClusters.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  analysisJson: jsonb('analysis_json').notNull(),
  modelUsed: varchar('model_used', { length: 100 }),
  tokensUsed: integer('tokens_used'),
  costEstimate: decimal('cost_estimate', { precision: 10, scale: 6 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Fase D — Bloque 2: plan de contenido satélite para un cluster PILAR
// (transaccional/local). Un plan por cluster, se regenera en vez de
// acumular histórico — mismo patrón que seoCompetitorAnalysis de arriba.
// Sigue el SQL literal aprobado explícitamente por Enric: created_at /
// updated_at con zona horaria (timestamptz, distinto del resto de tablas
// de este archivo) y sin NOT NULL en ninguna columna salvo las FK.
export const seoClusterContentPlan = pgTable(
  'seo_cluster_content_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clusterId: uuid('cluster_id')
      .notNull()
      .references(() => seoKwClusters.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    manualQuestions: jsonb('manual_questions').default([]),
    analysisJson: jsonb('analysis_json'),
    modelUsed: text('model_used'),
    tokensUsed: integer('tokens_used'),
    costEstimate: decimal('cost_estimate', { precision: 10, scale: 6 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('unique_cluster_content_plan').on(table.clusterId)]
);

export const seoShareTokens = pgTable('seo_share_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const seoKwProgress = pgTable(
  'seo_kw_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    step: varchar('step', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    targetKeyword: varchar('target_keyword', { length: 255 }),
    notes: text('notes'),
    instructionsText: text('instructions_text'),
    tutorText: text('tutor_text'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [unique().on(table.projectId, table.step)]
);

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id),
  projectId: uuid('project_id').references(() => projects.id),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
  userRoles: many(userRoles),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  projects: many(projects),
  aiProviderSettings: many(aiProviderSettings),
  aiJobs: many(aiJobs),
}));

export const aiProviderSettingsRelations = relations(aiProviderSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [aiProviderSettings.tenantId],
    references: [tenants.id],
  }),
}));

export const aiJobsRelations = relations(aiJobs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [aiJobs.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [aiJobs.projectId],
    references: [projects.id],
  }),
}));

export const aiPromptsRelations = relations(aiPrompts, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [aiPrompts.updatedBy],
    references: [users.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  createdBy: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  userRoles: many(userRoles),
  projectModules: many(projectModules),
  seoStageProgress: many(seoStageProgress),
  seoKickoffAnswers: many(seoKickoffAnswers),
  seoAuditFindings: many(seoAuditFindings),
  seoOnboardingChecklist: many(seoOnboardingChecklist),
  seoKwCompetitors: many(seoKwCompetitors),
  seoKwRaw: many(seoKwRaw),
  seoKwClusters: many(seoKwClusters),
  seoKwProgress: many(seoKwProgress),
  aiJobs: many(aiJobs),
}));

export const modulesRelations = relations(modules, ({ many }) => ({
  projectModules: many(projectModules),
}));

export const projectModulesRelations = relations(projectModules, ({ one }) => ({
  project: one(projects, {
    fields: [projectModules.projectId],
    references: [projects.id],
  }),
  module: one(modules, {
    fields: [projectModules.moduleKey],
    references: [modules.key],
  }),
}));

export const seoStageProgressRelations = relations(seoStageProgress, ({ one }) => ({
  project: one(projects, {
    fields: [seoStageProgress.projectId],
    references: [projects.id],
  }),
}));

export const seoKickoffAnswersRelations = relations(seoKickoffAnswers, ({ one }) => ({
  project: one(projects, {
    fields: [seoKickoffAnswers.projectId],
    references: [projects.id],
  }),
}));

export const seoAuditFindingsRelations = relations(seoAuditFindings, ({ one }) => ({
  project: one(projects, {
    fields: [seoAuditFindings.projectId],
    references: [projects.id],
  }),
}));

export const seoKwCompetitorsRelations = relations(seoKwCompetitors, ({ one }) => ({
  project: one(projects, {
    fields: [seoKwCompetitors.projectId],
    references: [projects.id],
  }),
}));

export const seoKwRawRelations = relations(seoKwRaw, ({ one }) => ({
  project: one(projects, {
    fields: [seoKwRaw.projectId],
    references: [projects.id],
  }),
}));

export const seoKwClustersRelations = relations(seoKwClusters, ({ one, many }) => ({
  project: one(projects, {
    fields: [seoKwClusters.projectId],
    references: [projects.id],
  }),
  keywords: many(seoKwClusterKeywords),
  competitors: many(seoClusterCompetitors),
  competitorAnalyses: many(seoCompetitorAnalysis),
}));

export const seoClusterCompetitorsRelations = relations(seoClusterCompetitors, ({ one }) => ({
  cluster: one(seoKwClusters, {
    fields: [seoClusterCompetitors.clusterId],
    references: [seoKwClusters.id],
  }),
  tenant: one(tenants, {
    fields: [seoClusterCompetitors.tenantId],
    references: [tenants.id],
  }),
}));

export const seoCompetitorAnalysisRelations = relations(seoCompetitorAnalysis, ({ one }) => ({
  cluster: one(seoKwClusters, {
    fields: [seoCompetitorAnalysis.clusterId],
    references: [seoKwClusters.id],
  }),
  tenant: one(tenants, {
    fields: [seoCompetitorAnalysis.tenantId],
    references: [tenants.id],
  }),
}));

export const seoClusterContentPlanRelations = relations(seoClusterContentPlan, ({ one }) => ({
  cluster: one(seoKwClusters, {
    fields: [seoClusterContentPlan.clusterId],
    references: [seoKwClusters.id],
  }),
  tenant: one(tenants, {
    fields: [seoClusterContentPlan.tenantId],
    references: [tenants.id],
  }),
}));

export const seoKwClusterKeywordsRelations = relations(
  seoKwClusterKeywords,
  ({ one }) => ({
    cluster: one(seoKwClusters, {
      fields: [seoKwClusterKeywords.clusterId],
      references: [seoKwClusters.id],
    }),
  })
);

export const seoShareTokensRelations = relations(seoShareTokens, ({ one }) => ({
  project: one(projects, {
    fields: [seoShareTokens.projectId],
    references: [projects.id],
  }),
}));

export const seoKwProgressRelations = relations(seoKwProgress, ({ one }) => ({
  project: one(projects, {
    fields: [seoKwProgress.projectId],
    references: [projects.id],
  }),
}));

export const seoOnboardingChecklistRelations = relations(
  seoOnboardingChecklist,
  ({ one }) => ({
    project: one(projects, {
      fields: [seoOnboardingChecklist.projectId],
      references: [projects.id],
    }),
  })
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  project: one(projects, {
    fields: [userRoles.projectId],
    references: [projects.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
export type ProjectModule = typeof projectModules.$inferSelect;
export type NewProjectModule = typeof projectModules.$inferInsert;
export type SeoStageProgress = typeof seoStageProgress.$inferSelect;
export type NewSeoStageProgress = typeof seoStageProgress.$inferInsert;
export type SeoKnowledgeCard = typeof seoKnowledgeCards.$inferSelect;
export type NewSeoKnowledgeCard = typeof seoKnowledgeCards.$inferInsert;
export type SeoKickoffAnswer = typeof seoKickoffAnswers.$inferSelect;
export type NewSeoKickoffAnswer = typeof seoKickoffAnswers.$inferInsert;
export type SeoAuditFinding = typeof seoAuditFindings.$inferSelect;
export type NewSeoAuditFinding = typeof seoAuditFindings.$inferInsert;
export type SeoOnboardingChecklistItem = typeof seoOnboardingChecklist.$inferSelect;
export type NewSeoOnboardingChecklistItem = typeof seoOnboardingChecklist.$inferInsert;
export type SeoSetting = typeof seoSettings.$inferSelect;
export type NewSeoSetting = typeof seoSettings.$inferInsert;
export type SeoKwCompetitor = typeof seoKwCompetitors.$inferSelect;
export type NewSeoKwCompetitor = typeof seoKwCompetitors.$inferInsert;
export type SeoKwRaw = typeof seoKwRaw.$inferSelect;
export type NewSeoKwRaw = typeof seoKwRaw.$inferInsert;
export type SeoKwCluster = typeof seoKwClusters.$inferSelect;
export type NewSeoKwCluster = typeof seoKwClusters.$inferInsert;
export type SeoKwClusterKeyword = typeof seoKwClusterKeywords.$inferSelect;
export type NewSeoKwClusterKeyword = typeof seoKwClusterKeywords.$inferInsert;
export type SeoClusterCompetitor = typeof seoClusterCompetitors.$inferSelect;
export type NewSeoClusterCompetitor = typeof seoClusterCompetitors.$inferInsert;
export type SeoCompetitorAnalysis = typeof seoCompetitorAnalysis.$inferSelect;
export type NewSeoCompetitorAnalysis = typeof seoCompetitorAnalysis.$inferInsert;
export type SeoClusterContentPlan = typeof seoClusterContentPlan.$inferSelect;
export type NewSeoClusterContentPlan = typeof seoClusterContentPlan.$inferInsert;
export type SeoShareToken = typeof seoShareTokens.$inferSelect;
export type NewSeoShareToken = typeof seoShareTokens.$inferInsert;
export type SeoKwProgress = typeof seoKwProgress.$inferSelect;
export type NewSeoKwProgress = typeof seoKwProgress.$inferInsert;
export type AiProviderSetting = typeof aiProviderSettings.$inferSelect;
export type NewAiProviderSetting = typeof aiProviderSettings.$inferInsert;
export type AiModelPricing = typeof aiModelPricing.$inferSelect;
export type NewAiModelPricing = typeof aiModelPricing.$inferInsert;
export type AiJob = typeof aiJobs.$inferSelect;
export type NewAiJob = typeof aiJobs.$inferInsert;
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type AiPromptEval = typeof aiPromptEvals.$inferSelect;
export type NewAiPrompt = typeof aiPrompts.$inferInsert;
export type AiClusteringExample = typeof aiClusteringExamples.$inferSelect;
export type NewAiClusteringExample = typeof aiClusteringExamples.$inferInsert;
export type AiIntentModifier = typeof aiIntentModifiers.$inferSelect;
export type NewAiIntentModifier = typeof aiIntentModifiers.$inferInsert;
export type AiClusteringFeedback = typeof aiClusteringFeedback.$inferSelect;
export type NewAiClusteringFeedback = typeof aiClusteringFeedback.$inferInsert;
// ---------------------------------------------------------------------------
// Módulo Operaciones (prefijo ops_)
// ---------------------------------------------------------------------------

// Token personal de ClickUp, cifrado con lib/ai/encryption.ts — mismo formato
// que ai_provider_settings (api_key_encrypted lleva la etiqueta GCM incluida).
export const opsClickupConnections = pgTable('ops_clickup_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  apiKeyIv: text('api_key_iv').notNull(),
  workspaceId: varchar('workspace_id', { length: 50 }),
  // Datos de la última sincronización de la estructura de ClickUp (caché).
  workspaceName: varchar('workspace_name', { length: 255 }),
  meClickupId: varchar('me_clickup_id', { length: 50 }),
  meUsername: varchar('me_username', { length: 255 }),
  structureSyncedAt: timestamp('structure_synced_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type OpsClickupConnection = typeof opsClickupConnections.$inferSelect;

// Caché de la estructura de ClickUp (espacios, listas, miembros): las pantallas
// leen de aquí en vez de llamar a ClickUp (límite de 100 peticiones/minuto).
// Solo se guardan las listas de los espacios seleccionados (selected = true).
export const opsClickupSpaces = pgTable(
  'ops_clickup_spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupSpaceId: varchar('clickup_space_id', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    selected: boolean('selected').notNull().default(false),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_clickup_spaces_tenant_space_unique').on(table.tenantId, table.clickupSpaceId)]
);

export const opsClickupLists = pgTable(
  'ops_clickup_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupListId: varchar('clickup_list_id', { length: 50 }).notNull(),
    clickupSpaceId: varchar('clickup_space_id', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    folderName: varchar('folder_name', { length: 255 }),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
    // Campo personalizado "Cliente" de la lista (ops_clickup_fields.clickup_field_id); null = no tiene.
    clientFieldId: varchar('client_field_id', { length: 50 }),
    // Cuándo se comprobaron los campos de esta lista (null = nunca).
    fieldsSyncedAt: timestamp('fields_synced_at'),
    // Estados de la lista: [{ status, type }] (type: open | custom | done | closed).
    statuses: jsonb('statuses').$type<{ status: string; type: string }[]>(),
  },
  (table) => [
    unique('ops_clickup_lists_tenant_list_unique').on(table.tenantId, table.clickupListId),
    index('ops_clickup_lists_tenant_space_idx').on(table.tenantId, table.clickupSpaceId),
  ]
);

// Campos personalizados desplegables (p. ej. "Cliente") con sus opciones. Se guardan una sola
// vez por campo: el mismo campo vale para muchas listas.
export const opsClickupFields = pgTable(
  'ops_clickup_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupFieldId: varchar('clickup_field_id', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    options: jsonb('options').$type<{ id: string; label: string }[]>().notNull().default([]),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_clickup_fields_tenant_field_unique').on(table.tenantId, table.clickupFieldId)]
);

export const opsClickupMembers = pgTable(
  'ops_clickup_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupUserId: varchar('clickup_user_id', { length: 50 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_clickup_members_tenant_user_unique').on(table.tenantId, table.clickupUserId)]
);

// Registro de peticiones a ClickUp (para el contador y la tabla de Ajustes).
// Los registros de más de 24 h se borran solos (ver lib/operaciones/clickup.ts).
export const opsClickupRequests = pgTable(
  'ops_clickup_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    method: varchar('method', { length: 10 }).notNull(),
    endpoint: varchar('endpoint', { length: 200 }).notNull(),
    status: integer('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
  },
  (table) => [index('ops_clickup_requests_tenant_time_idx').on(table.tenantId, table.requestedAt)]
);

// Bloc de notas: texto libre (escrito o dictado) que la IA convierte en uno o
// varios encargos. Se autoguarda; estado 'borrador' → 'convertida'.
export const opsNotes = pgTable(
  'ops_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull().default(''),
    clickupSpaceId: varchar('clickup_space_id', { length: 50 }),
    clickupSpaceName: varchar('clickup_space_name', { length: 255 }),
    assigneeClickupId: varchar('assignee_clickup_id', { length: 50 }),
    assigneeName: varchar('assignee_name', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('borrador'),
    // Última propuesta de la IA (encargos + no_convertido) para que la
    // pantalla de revisión sobreviva a una recarga sin volver a llamar a la IA.
    proposal: jsonb('proposal'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    convertedAt: timestamp('converted_at'),
  },
  (table) => [
    check('ops_notes_status_check', sql`${table.status} IN ('borrador', 'convertida')`),
    index('ops_notes_tenant_updated_idx').on(table.tenantId, table.updatedAt),
  ]
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// El audio vive en la base de datos: el contenedor se recrea en cada
// despliegue (un archivo en disco se perdería), el volumen de Postgres no.
export const opsNoteAudios = pgTable(
  'ops_note_audios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => opsNotes.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    data: bytea('data').notNull(),
    transcript: text('transcript'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('ops_note_audios_note_idx').on(table.noteId)]
);

// Ajustes del módulo Operaciones por cuenta (clave/valor). De momento:
// 'transcription_model' (modelo de Gemini para transcribir audio).
export const opsSettings = pgTable(
  'ops_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_settings_tenant_key_unique').on(table.tenantId, table.key)]
);

export type OpsNote = typeof opsNotes.$inferSelect;
export type OpsNoteAudio = typeof opsNoteAudios.$inferSelect;

// Encargos creados desde la herramienta hacia ClickUp. Se guardan SIEMPRE
// primero como 'pendiente_clickup'; solo pasan a 'creado' cuando ClickUp
// confirma la tarea (id + url). 'error_sync' guarda el motivo en error_message.
export const opsRequests = pgTable(
  'ops_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    clickupListId: varchar('clickup_list_id', { length: 50 }).notNull(),
    clickupListName: varchar('clickup_list_name', { length: 255 }),
    title: varchar('title', { length: 500 }).notNull(),
    originalRequest: text('original_request').notNull(),
    preparedDescription: text('prepared_description').notNull(),
    assigneeClickupId: varchar('assignee_clickup_id', { length: 50 }),
    assigneeName: varchar('assignee_name', { length: 255 }),
    dueDate: date('due_date'),
    // 1 urgente, 2 alta, 3 normal, 4 baja (misma escala que ClickUp)
    priority: integer('priority'),
    status: varchar('status', { length: 20 }).notNull().default('pendiente_clickup'),
    clickupTaskId: varchar('clickup_task_id', { length: 50 }),
    clickupTaskUrl: text('clickup_task_url'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    syncedAt: timestamp('synced_at'),
    // Nota de la que salió el encargo (null en los encargos sueltos) y
    // cuándo se adjuntó su audio a la tarea de ClickUp.
    noteId: uuid('note_id').references(() => opsNotes.id, { onDelete: 'set null' }),
    audioAttachedAt: timestamp('audio_attached_at'),
    // "✅ Visto" pulsado en Telegram por el chat del responsable (o el mío en modo pruebas).
    seenAt: timestamp('seen_at'),
    seenBy: varchar('seen_by', { length: 255 }),
    // Opción elegida del campo personalizado "Cliente" de ClickUp (null = sin cliente).
    clientOptionId: varchar('client_option_id', { length: 50 }),
    clientName: varchar('client_name', { length: 255 }),
    // Proyecto del que nace el encargo (cimientos, 23 nov 2026): estratega o plan de mejora de un proyecto.
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    // Flujo de trabajo (paso 5): asignado → en_curso → (bloqueado) → en_revision → completado.
    workStatus: varchar('work_status', { length: 20 }).notNull().default('asignado'),
    workStatusAt: timestamp('work_status_at').notNull().defaultNow(),
    workTypeKey: varchar('work_type_key', { length: 40 }),
    // null = sin revisión; 'owner' = la persona que lleva las operaciones; futuro: revisores automáticos.
    reviewerKey: varchar('reviewer_key', { length: 30 }),
    doneNote: text('done_note'),
    // Paso 6C: 'clickup' = encargo espejo de una tarea creada o asignada directamente en ClickUp.
    origin: varchar('origin', { length: 20 }).notNull().default('herramienta'),
    // Responsables avisados a la vez (tareas con varios asignados); quien pulsa Empezar queda como responsable.
    candidateIds: jsonb('candidate_ids').$type<string[]>().notNull().default([]),
    remindedAt: timestamp('reminded_at'),
    unansweredListedAt: timestamp('unanswered_listed_at'),
  },
  (table) => [
    index('ops_requests_note_idx').on(table.noteId),
    check('ops_requests_origin_check', sql`${table.origin} IN ('herramienta', 'clickup')`),
    check(
      'ops_requests_work_status_check',
      sql`${table.workStatus} IN ('asignado', 'en_curso', 'bloqueado', 'en_revision', 'devuelto', 'completado')`
    ),
    check(
      'ops_requests_status_check',
      sql`${table.status} IN ('pendiente_clickup', 'creado', 'error_sync')`
    ),
    check(
      'ops_requests_priority_check',
      sql`${table.priority} IS NULL OR ${table.priority} BETWEEN 1 AND 4`
    ),
    index('ops_requests_tenant_created_idx').on(table.tenantId, table.createdAt),
    // Protección extra contra duplicados: una tarea de ClickUp no puede
    // estar enlazada a dos encargos.
    uniqueIndex('ops_requests_clickup_task_id_unique')
      .on(table.clickupTaskId)
      .where(sql`${table.clickupTaskId} IS NOT NULL`),
  ]
);

// Vigilancia de ClickUp (paso 6C): estado de la consulta periódica y última situación conocida de cada tarea.
export const opsClickupWatch = pgTable('ops_clickup_watch', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  activatedAt: timestamp('activated_at'),
  cursorMs: bigint('cursor_ms', { mode: 'number' }),
  lastRunAt: timestamp('last_run_at'),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const opsClickupTaskSnapshots = pgTable(
  'ops_clickup_task_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupTaskId: varchar('clickup_task_id', { length: 50 }).notNull(),
    assigneeIds: jsonb('assignee_ids').$type<string[]>().notNull().default([]),
    status: varchar('status', { length: 100 }),
    statusType: varchar('status_type', { length: 30 }),
    dateUpdatedMs: bigint('date_updated_ms', { mode: 'number' }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_clickup_task_snapshots_unique').on(table.tenantId, table.clickupTaskId)]
);

export type OpsRequest = typeof opsRequests.$inferSelect;

// ---------------------------------------------------------------------------
// Avisos por Telegram
// ---------------------------------------------------------------------------

// Bot de Telegram de la cuenta (token cifrado, mismo formato que el de ClickUp).
export const opsTelegramConfig = pgTable('ops_telegram_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  botTokenEncrypted: text('bot_token_encrypted').notNull(),
  botTokenIv: text('bot_token_iv').notNull(),
  botUsername: varchar('bot_username', { length: 100 }),
  botName: varchar('bot_name', { length: 255 }),
  // Mientras esté activo, los avisos solo se envían al dueño (indicando a quién iban).
  testMode: boolean('test_mode').notNull().default(true),
  // 'polling' (consulta periódica, en local) o 'webhook' (en un servidor con URL pública).
  receiveMode: varchar('receive_mode', { length: 10 }).notNull().default('polling'),
  webhookUrl: text('webhook_url'),
  lastUpdateId: bigint('last_update_id', { mode: 'number' }).notNull().default(0),
  lastPollAt: timestamp('last_poll_at'),
  // Último error de la escucha (p. ej. "CONFLICTO: otro proceso escucha este bot").
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at'),
  // Horas (HH:MM separadas por coma) de los resúmenes para el dueño, en su zona horaria.
  digestTimes: varchar('digest_times', { length: 40 }).notNull().default('13:00,18:00'),
  digestTimezone: varchar('digest_timezone', { length: 60 }).notNull().default('Europe/Madrid'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Bots de departamento (20 nov 2026, organigrama): además del bot de Operaciones (ops_telegram_config), cada jefe de
// departamento puede tener su propio bot (p. ej. «Kijutech Sistema»). Solo hablan con el dueño (en un chat privado
// el id del chat es el del usuario, el mismo que con el bot principal) y solo por webhook. Los avisos llevan
// payload.bot = key; si el bot no está listo, salen por el bot principal (nunca se pierden).
export const opsTelegramBots = pgTable(
  'ops_telegram_bots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    botTokenEncrypted: text('bot_token_encrypted').notNull(),
    botTokenIv: text('bot_token_iv').notNull(),
    botUsername: varchar('bot_username', { length: 100 }),
    botName: varchar('bot_name', { length: 255 }),
    // El dueño pulsó «Iniciar» (o el bot ya le pudo escribir): desde entonces los avisos salen por aquí.
    readyAt: timestamp('ready_at'),
    webhookSetAt: timestamp('webhook_set_at'),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_telegram_bots_tenant_key_unique').on(table.tenantId, table.key)]
);
export type OpsTelegramBot = typeof opsTelegramBots.$inferSelect;

// Una fila por miembro de ClickUp: su vinculación con Telegram y su horario.
export const opsTelegramMembers = pgTable(
  'ops_telegram_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupUserId: varchar('clickup_user_id', { length: 50 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    // Código del enlace t.me/<bot>?start=<código>. De un solo uso: al vincularse
    // se borra (null). Se genera uno nuevo con el botón de Ajustes.
    linkCode: varchar('link_code', { length: 40 }).unique(),
    telegramChatId: bigint('telegram_chat_id', { mode: 'number' }),
    telegramUsername: varchar('telegram_username', { length: 100 }),
    linkedAt: timestamp('linked_at'),
    timezone: varchar('timezone', { length: 60 }).notNull().default('America/Santo_Domingo'),
    workStart: varchar('work_start', { length: 5 }).notNull().default('09:00'),
    dailyEnabled: boolean('daily_enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_telegram_members_tenant_user_unique').on(table.tenantId, table.clickupUserId)]
);

// Cada aviso con su estado. dedupe_key único = nunca se envía dos veces el mismo
// (encargo: "new_request:<id>"; resumen: "daily:<persona>:<fecha local>").
export const opsNotifications = pgTable(
  'ops_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    forClickupUserId: varchar('for_clickup_user_id', { length: 50 }),
    forName: varchar('for_name', { length: 255 }),
    // Destino real; se resuelve al enviar (en modo pruebas, el chat del dueño).
    chatId: bigint('chat_id', { mode: 'number' }),
    requestId: uuid('request_id').references(() => opsRequests.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 10 }).notNull().default('pendiente'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at').notNull().defaultNow(),
    sentAt: timestamp('sent_at'),
    telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('ops_notifications_tenant_dedupe_unique').on(table.tenantId, table.dedupeKey),
    index('ops_notifications_status_next_idx').on(table.status, table.nextAttemptAt),
    check('ops_notifications_status_check', sql`${table.status} IN ('pendiente', 'enviado', 'fallido')`),
    check(
      'ops_notifications_kind_check',
      sql`${table.kind} IN ('new_request', 'daily_summary', 'test', 'review_request', 'block_alert', 'reply', 'returned', 'digest', 'reminder', 'cleanup', 'cleanup_summary', 'startup', 'email_proposal', 'health', 'jornada')`
    ),
  ]
);

// ---------------------------------------------------------------------------
// Operaciones · paso 5: flujo de trabajo desde Telegram
// ---------------------------------------------------------------------------

// Tipos de trabajo (editables).
export const opsWorkTypes = pgTable(
  'ops_work_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    // Margen de minutos de una tarea de este tipo (paso 5B); null = sin margen.
    minMinutes: integer('min_minutes'),
    maxMinutes: integer('max_minutes'),
  },
  (table) => [
    unique('ops_work_types_tenant_key_unique').on(table.tenantId, table.key),
    check(
      'ops_work_types_band_check',
      sql`(${table.minMinutes} IS NULL OR ${table.minMinutes} >= 0) AND (${table.maxMinutes} IS NULL OR ${table.maxMinutes} > 0) AND (${table.minMinutes} IS NULL OR ${table.maxMinutes} IS NULL OR ${table.minMinutes} <= ${table.maxMinutes})`
    ),
  ]
);

// Correspondencia de estados de ClickUp por lista (editable en Ajustes).
export const opsStatusMap = pgTable(
  'ops_status_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupListId: varchar('clickup_list_id', { length: 50 }).notNull(),
    inProgressStatus: varchar('in_progress_status', { length: 100 }),
    inReviewStatus: varchar('in_review_status', { length: 100 }),
    doneStatus: varchar('done_status', { length: 100 }),
    // true = la cambió una persona (no se vuelve a proponer automáticamente).
    edited: boolean('edited').notNull().default(false),
  },
  (table) => [unique('ops_status_map_tenant_list_unique').on(table.tenantId, table.clickupListId)]
);

// Bloqueos que comunica una persona desde Telegram.
export const opsBlockers = pgTable(
  'ops_blockers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').references(() => opsRequests.id, { onDelete: 'set null' }),
    askedByClickupId: varchar('asked_by_clickup_id', { length: 50 }),
    askedByName: varchar('asked_by_name', { length: 255 }),
    question: text('question').notNull(),
    attachmentFileId: text('attachment_file_id'),
    status: varchar('status', { length: 20 }).notNull().default('abierto'),
    aiAnswer: text('ai_answer'),
    aiSource: text('ai_source'),
    aiSummary: text('ai_summary'),
    aiOptions: jsonb('ai_options'),
    aiRecommendation: text('ai_recommendation'),
    ownerAnswer: text('owner_answer'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    answeredAt: timestamp('answered_at'),
  },
  (table) => [
    index('ops_blockers_status_idx').on(table.tenantId, table.status, table.createdAt),
    check(
      'ops_blockers_status_check',
      sql`${table.status} IN ('abierto', 'respondido_agente', 'escalado', 'respondido_owner')`
    ),
  ]
);

// Eventos: cada pulsación de botón y acción del bot. Solo se guardan (medición futura).
export const opsRequestEvents = pgTable(
  'ops_request_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').references(() => opsRequests.id, { onDelete: 'set null' }),
    personClickupUserId: varchar('person_clickup_user_id', { length: 50 }),
    personName: varchar('person_name', { length: 255 }),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('ops_request_events_req_idx').on(table.requestId, table.createdAt),
    index('ops_request_events_tenant_idx').on(table.tenantId, table.createdAt),
  ]
);

// Bandeja de salida hacia ClickUp (cambios de estado y comentarios, con reintentos).
export const opsClickupOutbox = pgTable(
  'ops_clickup_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').references(() => opsRequests.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 20 }).notNull(),
    payload: jsonb('payload').notNull(),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    status: varchar('status', { length: 10 }).notNull().default('pendiente'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at').notNull().defaultNow(),
    doneAt: timestamp('done_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('ops_clickup_outbox_tenant_dedupe_unique').on(table.tenantId, table.dedupeKey),
    index('ops_outbox_status_idx').on(table.status, table.nextAttemptAt),
    check('ops_outbox_status_check', sql`${table.status} IN ('pendiente', 'hecho', 'fallido')`),
    check('ops_outbox_action_check', sql`${table.action} IN ('set_status', 'comment', 'set_due', 'set_assignee')`),
  ]
);

// Conversación pendiente del bot (esperando enlace, motivo, pregunta o respuesta).
export const opsTelegramPending = pgTable('ops_telegram_pending', {
  chatId: bigint('chat_id', { mode: 'number' }).primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).notNull(),
  requestId: uuid('request_id').references(() => opsRequests.id, { onDelete: 'cascade' }),
  blockerId: uuid('blocker_id').references(() => opsBlockers.id, { onDelete: 'cascade' }),
  cleanupItemId: uuid('cleanup_item_id').references(() => opsCleanupItems.id, { onDelete: 'cascade' }),
  // Motor de acciones: Enric está escribiendo la corrección de una propuesta (p. ej. una respuesta de correo).
  agentActionId: uuid('agent_action_id').references((): AnyPgColumn => opsAgentActions.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Ficha de cada persona del equipo (sección «Equipo»). Fuente única de zona horaria y horario.
// user_id queda preparado para que más adelante cada miembro vea su propio perfil.
export const opsTeamProfiles = pgTable(
  'ops_team_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupUserId: varchar('clickup_user_id', { length: 50 }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    jobTitle: varchar('job_title', { length: 150 }),
    description: text('description'),
    notes: text('notes'),
    // Días laborables: 1 = lunes … 7 = domingo.
    workDays: varchar('work_days', { length: 20 }).notNull().default('1,2,3,4,5'),
    workStart: varchar('work_start', { length: 5 }).notNull().default('09:00'),
    hoursPerDay: decimal('hours_per_day', { precision: 4, scale: 2 }).notNull().default('8'),
    timezone: varchar('timezone', { length: 60 }).notNull().default('America/Santo_Domingo'),
    // Comida y silencio (HH:MM, en su zona): en ese hueco no se le envía nada. null = sin hueco.
    lunchStart: varchar('lunch_start', { length: 5 }),
    lunchEnd: varchar('lunch_end', { length: 5 }),
    quietStart: varchar('quiet_start', { length: 5 }),
    quietEnd: varchar('quiet_end', { length: 5 }),
    urgentBypassQuiet: boolean('urgent_bypass_quiet').notNull().default(false),
    // Organigrama (0058, 21 nov 2026): departamento en el que trabaja (agt_departments.key). null = sin departamento.
    departmentKey: varchar('department_key', { length: 40 }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_team_profiles_tenant_clickup_unique').on(table.tenantId, table.clickupUserId)]
);

// Foto o avatar de cada persona (0058, 21 nov 2026). Tabla aparte para no cargar la imagen en cada consulta de las fichas.
// La imagen llega reducida desde el navegador (256 px); si no hay, se muestran iniciales con un color.
export const opsTeamAvatars = pgTable(
  'ops_team_avatars',
  {
    profileId: uuid('profile_id')
      .primaryKey()
      .references(() => opsTeamProfiles.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    mime: varchar('mime', { length: 30 }).notNull(),
    data: bytea('data').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [check('ops_team_avatars_mime_check', sql`${table.mime} IN ('image/webp', 'image/png', 'image/jpeg')`)]
);

export const opsTeamProfileWorkTypes = pgTable(
  'ops_team_profile_work_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => opsTeamProfiles.id, { onDelete: 'cascade' }),
    workTypeKey: varchar('work_type_key', { length: 40 }).notNull(),
    role: varchar('role', { length: 10 }).notNull(),
  },
  (table) => [
    unique('ops_team_profile_work_types_unique').on(table.profileId, table.workTypeKey),
    check('ops_team_profile_work_types_role_check', sql`${table.role} IN ('primary', 'support')`),
  ]
);

// Sección «Clientes»: ficha por cliente. Los niveles y los servicios son tablas editables, así que
// level / service_key se validan en el código contra ellas (sin CHECK de valores fijos).
export const opsClientLevels = pgTable(
  'ops_client_levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 30 }).notNull(),
    label: varchar('label', { length: 60 }).notNull(),
    defaultDays: integer('default_days').notNull(),
    // Alertas de cliente (6D): días sin actividad y horizonte de trabajo planificado (0 = desactivado).
    inactivityDays: integer('inactivity_days').notNull().default(14),
    planningDays: integer('planning_days').notNull().default(14),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    unique('ops_client_levels_tenant_key_unique').on(table.tenantId, table.key),
    check('ops_client_levels_days_check', sql`${table.defaultDays} BETWEEN 0 AND 60`),
    check('ops_client_levels_inactivity_check', sql`${table.inactivityDays} BETWEEN 1 AND 90`),
    check('ops_client_levels_planning_check', sql`${table.planningDays} BETWEEN 0 AND 60`),
  ]
);

export const opsServices = pgTable(
  'ops_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (table) => [unique('ops_services_tenant_key_unique').on(table.tenantId, table.key)]
);


// Ajustes de Operaciones de cada cliente (desde el 14 nov 2026 la ficha está en el núcleo, tabla clients; mismo id).
// Un cliente del núcleo puede no tener fila aquí todavía: Operaciones usa los valores por defecto.
export const opsClients = pgTable(
  'ops_clients',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupOptionId: varchar('clickup_option_id', { length: 50 }),
    clickupOptionLabel: varchar('clickup_option_label', { length: 255 }),
    usualSpaceId: varchar('usual_space_id', { length: 50 }),
    usualListIds: jsonb('usual_list_ids').$type<string[]>().notNull().default([]),
    level: varchar('level', { length: 30 }).notNull().default('standard'),
    // null = el plazo por defecto del nivel.
    deliveryDays: integer('delivery_days'),
    // Alertas (6D): null = el del nivel; planning_days 0 = desactivado para este cliente.
    inactivityDays: integer('inactivity_days'),
    planningDays: integer('planning_days'),
    alertsEnabled: boolean('alerts_enabled').notNull().default(true),
    monthlyHours: decimal('monthly_hours', { precision: 6, scale: 1 }),
    // Días de la semana en que se le trabaja (1 = lunes … 7 = domingo); null = lunes a viernes.
    workDays: varchar('work_days', { length: 20 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('ops_clients_tenant_option_unique').on(table.tenantId, table.clickupOptionId),
    check('ops_clients_inactivity_check', sql`${table.inactivityDays} IS NULL OR ${table.inactivityDays} BETWEEN 1 AND 90`),
    check('ops_clients_planning_check', sql`${table.planningDays} IS NULL OR ${table.planningDays} BETWEEN 0 AND 60`),
    check('ops_clients_days_check', sql`${table.deliveryDays} IS NULL OR ${table.deliveryDays} BETWEEN 0 AND 60`),
  ]
);

export const opsClientServices = pgTable(
  'ops_client_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    serviceKey: varchar('service_key', { length: 40 }).notNull(),
    responsibleClickupId: varchar('responsible_clickup_id', { length: 50 }),
  },
  (table) => [unique('ops_client_services_unique').on(table.clientId, table.serviceKey)]
);

// Resultado de la pasada nocturna de actividad por cliente (una fila por cliente, se sobrescribe cada día).
export const opsClientActivity = pgTable(
  'ops_client_activity',
  {
    clientId: uuid('client_id')
      .primaryKey()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lastActivityMs: bigint('last_activity_ms', { mode: 'number' }),
    windowDays: integer('window_days').notNull(),
    completedMonth: integer('completed_month').notNull().default(0),
    upcomingTasks: integer('upcoming_tasks').notNull().default(0),
    horizonDays: integer('horizon_days').notNull().default(0),
    hoursMonth: decimal('hours_month', { precision: 7, scale: 1 }).notNull().default('0'),
    inactiveNotifiedAt: timestamp('inactive_notified_at'),
    unplannedNotifiedAt: timestamp('unplanned_notified_at'),
    computedAt: timestamp('computed_at').notNull().defaultNow(),
  },
  (table) => [index('ops_client_activity_tenant_idx').on(table.tenantId)]
);

// Memoria de cada cliente (NÚCLEO desde el 14 nov 2026; antes ops_client_memory): hechos con fecha y origen. La IA propone («propuesto») y una persona acepta;
// solo lo aceptado se usa como contexto. Nunca contraseñas.
export const clientMemory = pgTable(
  'client_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // preferencia | promesa | decision | contexto | restriccion
    kind: varchar('kind', { length: 20 }).notNull(),
    text: text('text').notNull(),
    // propuesto | aceptado | descartado
    status: varchar('status', { length: 12 }).notNull().default('aceptado'),
    // De dónde sale: manual | email | nota | encargo | agente (y el id de ese origen, si lo hay).
    sourceType: varchar('source_type', { length: 12 }).notNull().default('manual'),
    sourceId: varchar('source_id', { length: 100 }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    decidedBy: integer('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('client_memory_client_idx').on(table.clientId, table.status),
    check('client_memory_kind_check', sql`${table.kind} IN ('preferencia', 'promesa', 'decision', 'contexto', 'restriccion')`),
    check('client_memory_status_check', sql`${table.status} IN ('propuesto', 'aceptado', 'descartado')`),
    check('client_memory_source_check', sql`${table.sourceType} IN ('manual', 'email', 'nota', 'encargo', 'agente')`),
  ]
);

// Correos de clientes recibidos (paso B). Entran por el aviso firmado de Cloudflare o pegados a mano. Un correo
// es un dato NO fiable: la IA solo propondrá y una persona aprueba. Único por (cuenta, Message-ID).
export const opsInboundEmails = pgTable(
  'ops_inbound_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    messageId: varchar('message_id', { length: 500 }).notNull(),
    // cloudflare | pegado
    source: varchar('source', { length: 12 }).notNull().default('cloudflare'),
    fromAddress: varchar('from_address', { length: 320 }).notNull(),
    fromName: varchar('from_name', { length: 255 }),
    toAddress: varchar('to_address', { length: 320 }),
    subject: varchar('subject', { length: 500 }).notNull().default(''),
    // Texto plano ya limpio (sin HTML ni caracteres invisibles), máx. 20 000 caracteres.
    bodyText: text('body_text').notNull().default(''),
    // Solo los nombres de los adjuntos: no se descargan.
    attachments: jsonb('attachments').notNull().default([]),
    inReplyTo: varchar('in_reply_to', { length: 500 }),
    sentAt: timestamp('sent_at'),
    // Resultado de la autenticación del remitente según Cloudflare: pass | fail | none (pegado o desconocido).
    authStatus: varchar('auth_status', { length: 8 }).notNull().default('none'),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    // Cómo se reconoció al cliente: email | domain | manual | ninguno | ambiguo.
    matchedBy: varchar('matched_by', { length: 10 }).notNull().default('ninguno'),
    // nuevo | ignorado | sin_cliente | informativo | interpretando | propuesto | aprobado | descartado | error
    status: varchar('status', { length: 14 }).notNull().default('nuevo'),
    statusNote: varchar('status_note', { length: 255 }),
    // Propuesta de encargos (paso B2).
    proposal: jsonb('proposal'),
    providerEmailId: varchar('provider_email_id', { length: 100 }),
    referencesHeader: text('references_header'),
    decidedBy: integer('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('ops_inbound_emails_message_unique').on(table.tenantId, table.messageId),
    index('ops_inbound_emails_status_idx').on(table.tenantId, table.status, table.createdAt),
    index('ops_inbound_emails_client_idx').on(table.clientId),
    check('ops_inbound_emails_source_check', sql`${table.source} IN ('cloudflare', 'pegado', 'resend')`),
    check('ops_inbound_emails_auth_check', sql`${table.authStatus} IN ('pass', 'fail', 'none')`),
    check('ops_inbound_emails_match_check', sql`${table.matchedBy} IN ('email', 'domain', 'manual', 'ninguno', 'ambiguo')`),
    check(
      'ops_inbound_emails_status_check',
      sql`${table.status} IN ('nuevo', 'ignorado', 'sin_cliente', 'informativo', 'interpretando', 'propuesto', 'aprobado', 'descartado', 'error')`
    ),
  ]
);

export type OpsInboundEmail = typeof opsInboundEmails.$inferSelect;

// Motor de acciones del agente (paso 2, 11 nov 2026): toda propuesta del agente queda aquí con
// la decisión humana (aprobada a la primera, corregida, rechazada) o «auto» si actuó solo. Es la
// base del panel «Agente» y de subir la autonomía por tipo con datos. Diseño en
// docs/DISENO-MOTOR-ACCIONES.md.
export const opsAgentActions = pgTable(
  'ops_agent_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 30 }).notNull(),
    status: varchar('status', { length: 12 }).notNull().default('propuesto'),
    autonomy: varchar('autonomy', { length: 10 }).notNull(),
    summary: varchar('summary', { length: 500 }).notNull().default(''),
    proposal: jsonb('proposal').notNull(),
    final: jsonb('final'),
    requestId: uuid('request_id').references(() => opsRequests.id, { onDelete: 'set null' }),
    blockerId: uuid('blocker_id').references(() => opsBlockers.id, { onDelete: 'set null' }),
    noteId: uuid('note_id').references(() => opsNotes.id, { onDelete: 'set null' }),
    inboundEmailId: uuid('inbound_email_id').references(() => opsInboundEmails.id, { onDelete: 'set null' }),
    decidedByName: varchar('decided_by_name', { length: 255 }),
    decidedVia: varchar('decided_via', { length: 10 }),
    decidedAt: timestamp('decided_at'),
    executedAt: timestamp('executed_at'),
    error: varchar('error', { length: 500 }),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('ops_agent_actions_dedupe_unique').on(table.tenantId, table.dedupeKey),
    index('ops_agent_actions_kind_idx').on(table.tenantId, table.kind, table.createdAt),
    check('ops_agent_actions_kind_check', sql`${table.kind} IN ('blocker_answer', 'note_conversion', 'email_reply', 'agent_tool')`),
    check(
      'ops_agent_actions_status_check',
      sql`${table.status} IN ('propuesto', 'aprobado', 'corregido', 'rechazado', 'auto', 'sombra')`
    ),
    check('ops_agent_actions_autonomy_check', sql`${table.autonomy} IN ('sombra', 'aprobacion', 'autonomo')`),
    check('ops_agent_actions_via_check', sql`${table.decidedVia} IS NULL OR ${table.decidedVia} IN ('telegram', 'panel', 'agente')`),
  ]
);

export type OpsAgentAction = typeof opsAgentActions.$inferSelect;
export type ClientMemory = typeof clientMemory.$inferSelect;
export type OpsClientActivity = typeof opsClientActivity.$inferSelect;
export type OpsClient = typeof opsClients.$inferSelect;
export type OpsCleanupRun = typeof opsCleanupRuns.$inferSelect;
export type OpsCleanupItem = typeof opsCleanupItems.$inferSelect;
export type OpsSuggestion = typeof opsSuggestions.$inferSelect;
export type OpsTeamProfile = typeof opsTeamProfiles.$inferSelect;
export type OpsBlocker = typeof opsBlockers.$inferSelect;
export type OpsWorkType = typeof opsWorkTypes.$inferSelect;
export type OpsStatusMap = typeof opsStatusMap.$inferSelect;

export type OpsTelegramConfig = typeof opsTelegramConfig.$inferSelect;
export type OpsTelegramMember = typeof opsTelegramMembers.$inferSelect;
export type OpsNotification = typeof opsNotifications.$inferSelect;

export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}

// ---------------------------------------------------------------------------
// Operaciones · paso 6E: panel de Automatizaciones
// ---------------------------------------------------------------------------

// Solo guarda lo que el usuario ha cambiado; el resto son los valores por defecto del código.
export const opsAutomations = pgTable(
  'ops_automations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 60 }).notNull(),
    enabled: boolean('enabled'),
    config: jsonb('config').notNull().default({}),
    template: text('template'),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_automations_tenant_key_unique').on(table.tenantId, table.key)]
);

export const opsAutomationChanges = pgTable(
  'ops_automation_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    automationKey: varchar('automation_key', { length: 60 }).notNull(),
    field: varchar('field', { length: 60 }).notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: integer('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at').notNull().defaultNow(),
  },
  (table) => [index('ops_automation_changes_tenant_at_idx').on(table.tenantId, table.changedAt)]
);

// ---------------------------------------------------------------------------
// Operaciones · paso 7: preparación del piloto
// ---------------------------------------------------------------------------

// Limpieza asistida de tareas vencidas: una tanda por persona, con una fila por tarea.
export const opsCleanupRuns = pgTable(
  'ops_cleanup_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupUserId: varchar('clickup_user_id', { length: 50 }).notNull(),
    personName: varchar('person_name', { length: 255 }).notNull(),
    startedBy: varchar('started_by', { length: 255 }),
    status: varchar('status', { length: 12 }).notNull().default('en_curso'),
    total: integer('total').notNull().default(0),
    closed: integer('closed').notNull().default(0),
    rescheduled: integer('rescheduled').notNull().default(0),
    discarded: integer('discarded').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [
    uniqueIndex('ops_cleanup_runs_active_unique')
      .on(table.tenantId, table.clickupUserId)
      .where(sql`${table.status} = 'en_curso'`),
    check('ops_cleanup_runs_status_check', sql`${table.status} IN ('en_curso', 'completada', 'parada')`),
  ]
);

export const opsCleanupItems = pgTable(
  'ops_cleanup_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => opsCleanupRuns.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    clickupTaskId: varchar('clickup_task_id', { length: 50 }).notNull(),
    taskName: varchar('task_name', { length: 500 }).notNull(),
    taskUrl: text('task_url'),
    listId: varchar('list_id', { length: 50 }),
    listName: varchar('list_name', { length: 255 }),
    dueMs: bigint('due_ms', { mode: 'number' }),
    status: varchar('status', { length: 14 }).notNull().default('pendiente'),
    newDue: date('new_due'),
    answeredAt: timestamp('answered_at'),
  },
  (table) => [
    index('ops_cleanup_items_run_idx').on(table.runId, table.position),
    check(
      'ops_cleanup_items_status_check',
      sql`${table.status} IN ('pendiente', 'enviada', 'cerrada', 'reprogramada', 'descartada', 'omitida')`
    ),
  ]
);

// Sugerencias del equipo (/sugerencia en el bot).
export const opsSuggestions = pgTable(
  'ops_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    personClickupUserId: varchar('person_clickup_user_id', { length: 50 }),
    personName: varchar('person_name', { length: 255 }).notNull(),
    text: text('text').notNull(),
    photoFileId: text('photo_file_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    digestShownAt: timestamp('digest_shown_at'),
  },
  (table) => [index('ops_suggestions_tenant_idx').on(table.tenantId, table.createdAt)]
);

// Intentos de inicio de sesión: sirve para bloquear temporalmente tras demasiados fallos
// (lib/auth/rate-limit.ts). Guarda el correo y la IP, nunca la contraseña.
export const authLoginAttempts = pgTable(
  'auth_login_attempts',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    succeeded: boolean('succeeded').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_login_attempts_email_created_idx').on(table.email, table.createdAt)]
);

// Salud del sistema (paso 4, 12 nov 2026): incidencias de las comprobaciones periódicas (colas atascadas,
// errores de ClickUp/Telegram/IA…) y paradas detectadas al arrancar. Como mucho una abierta por
// comprobación (índice único parcial). Se avisa a Enric al abrirse y al resolverse.
export const opsHealthIncidents = pgTable(
  'ops_health_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    checkKey: varchar('check_key', { length: 40 }).notNull(),
    severity: varchar('severity', { length: 10 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    detail: text('detail').notNull().default(''),
    openedAt: timestamp('opened_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    notifiedAt: timestamp('notified_at'),
    resolvedNotifiedAt: timestamp('resolved_notified_at'),
  },
  (table) => [
    index('ops_health_incidents_tenant_idx').on(table.tenantId, table.openedAt),
    uniqueIndex('ops_health_incidents_open_unique')
      .on(table.tenantId, table.checkKey)
      .where(sql`${table.resolvedAt} IS NULL`),
    check('ops_health_incidents_severity_check', sql`${table.severity} IN ('aviso', 'critico')`),
  ]
);

export type OpsHealthIncident = typeof opsHealthIncidents.$inferSelect;

// Jornada real (paso 5A): cada registro de la jornada de una persona (entrada, descanso, comida, salida
// urgente, vuelta, salida, ausencia). El estado del día se calcula a partir de estos registros
// (lib/operaciones/jornada.ts). Nunca se borran: una corrección anula el registro (voided_*) y añade otro.
export const opsWorkEvents = pgTable(
  'ops_work_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => opsTeamProfiles.id, { onDelete: 'set null' }),
    clickupUserId: varchar('clickup_user_id', { length: 50 }).notNull(),
    personName: varchar('person_name', { length: 255 }).notNull(),
    // Día laboral en la zona horaria de la persona (YYYY-MM-DD).
    workDate: date('work_date', { mode: 'string' }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    at: timestamp('at').notNull(),
    plannedMinutes: integer('planned_minutes'),
    reason: text('reason'),
    // Tarea con la que empezó (entrada): { clickupTaskId, name, requestId }.
    task: jsonb('task'),
    source: varchar('source', { length: 15 }).notNull().default('telegram'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdByName: varchar('created_by_name', { length: 255 }),
    voidedAt: timestamp('voided_at'),
    voidedByName: varchar('voided_by_name', { length: 255 }),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('ops_work_events_person_day_idx').on(table.tenantId, table.clickupUserId, table.workDate),
    index('ops_work_events_day_idx').on(table.tenantId, table.workDate),
    check(
      'ops_work_events_kind_check',
      sql`${table.kind} IN ('entrada', 'descanso', 'comida', 'salida_urgente', 'vuelta', 'salida', 'ausencia', 'tarea')`
    ),
    check('ops_work_events_source_check', sql`${table.source} IN ('telegram', 'web', 'auto', 'correccion')`),
  ]
);

export type OpsWorkEvent = typeof opsWorkEvents.$inferSelect;

// Tiempos de tarea (paso 5B): una fila por tarea y persona. Se abre al empezar la tarea y se cierra al
// terminarla (bot, web o ClickUp). Los minutos salen de la jornada (solo tiempo trabajado con esa tarea
// activa). Guarda el margen vigente al cerrar para que cambiarlo después no altere el histórico.
export const opsTaskTimes = pgTable(
  'ops_task_times',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clickupTaskId: varchar('clickup_task_id', { length: 50 }).notNull(),
    requestId: uuid('request_id').references(() => opsRequests.id, { onDelete: 'set null' }),
    clickupUserId: varchar('clickup_user_id', { length: 50 }).notNull(),
    personName: varchar('person_name', { length: 255 }).notNull(),
    taskName: varchar('task_name', { length: 500 }).notNull(),
    workTypeKey: varchar('work_type_key', { length: 40 }),
    status: varchar('status', { length: 20 }).notNull().default('abierta'),
    startedAt: timestamp('started_at').notNull(),
    doneAt: timestamp('done_at'),
    workedMinutes: integer('worked_minutes'),
    estimateMinutes: integer('estimate_minutes'),
    bandMin: integer('band_min'),
    bandMax: integer('band_max'),
    verdict: varchar('verdict', { length: 20 }),
    precisionHit: boolean('precision_hit'),
    justifyStatus: varchar('justify_status', { length: 20 }).notNull().default('no_necesaria'),
    evidenceUrl: text('evidence_url'),
    overReason: varchar('over_reason', { length: 30 }),
    overNote: text('over_note'),
    source: varchar('source', { length: 20 }).notNull().default('bot'),
    voidedAt: timestamp('voided_at'),
    voidedByName: varchar('voided_by_name', { length: 255 }),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ops_task_times_open_unique')
      .on(table.tenantId, table.clickupTaskId, table.clickupUserId)
      .where(sql`${table.status} = 'abierta' AND ${table.voidedAt} IS NULL`),
    index('ops_task_times_done_idx').on(table.tenantId, table.doneAt),
    index('ops_task_times_person_idx').on(table.tenantId, table.clickupUserId, table.doneAt),
    check('ops_task_times_status_check', sql`${table.status} IN ('abierta', 'cerrada')`),
    check('ops_task_times_verdict_check', sql`${table.verdict} IS NULL OR ${table.verdict} IN ('dentro', 'rapido', 'pasado', 'sin_margen')`),
    check('ops_task_times_justify_check', sql`${table.justifyStatus} IN ('no_necesaria', 'pendiente', 'enviada')`),
    check('ops_task_times_source_check', sql`${table.source} IN ('bot', 'web', 'clickup', 'correccion')`),
  ]
);

export type OpsTaskTime = typeof opsTaskTimes.$inferSelect;

// --- Módulo Agentes (0047): agentes con rol, conversaciones, trabajos de subagentes e integraciones ----------------

export const agtAgents = pgTable(
  'agt_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull().default('subagente'),
    role: text('role').notNull().default(''),
    instructions: text('instructions').notNull().default(''),
    tools: jsonb('tools').$type<string[]>().notNull().default([]),
    model: varchar('model', { length: 80 }),
    voice: varchar('voice', { length: 30 }),
    monthlyBudgetUsd: decimal('monthly_budget_usd', { precision: 10, scale: 2 }),
    // Organigrama (0055): departamento al que pertenece (agt_departments.key). El jefe de un departamento es kind «jefe».
    departmentKey: varchar('department_key', { length: 40 }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('agt_agents_tenant_key_unique').on(table.tenantId, table.key),
    check('agt_agents_kind_check', sql`${table.kind} IN ('principal', 'jefe', 'subagente')`),
  ]
);
export type AgtAgent = typeof agtAgents.$inferSelect;

// Foto o avatar de cada agente (0058, 21 nov 2026). Igual que ops_team_avatars; si no hay, se muestra un icono.
export const agtAgentAvatars = pgTable(
  'agt_agent_avatars',
  {
    agentId: uuid('agent_id')
      .primaryKey()
      .references(() => agtAgents.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    mime: varchar('mime', { length: 30 }).notNull(),
    data: bytea('data').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [check('agt_agent_avatars_mime_check', sql`${table.mime} IN ('image/webp', 'image/png', 'image/jpeg')`)]
);

// Organigrama (0055, 20 nov 2026): departamentos de la agencia, su jefe (agente) y a quién reporta. Un departamento con
// bot (bot_key = ops_telegram_bots.key) habla con el dueño por su propio chat de Telegram.
export const agtDepartments = pgTable(
  'agt_departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description').notNull().default(''),
    headAgentKey: varchar('head_agent_key', { length: 40 }),
    reportsTo: varchar('reports_to', { length: 20 }).notNull().default('direccion'),
    botKey: varchar('bot_key', { length: 40 }),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('agt_departments_tenant_key_unique').on(table.tenantId, table.key),
    check('agt_departments_reports_check', sql`${table.reportsTo} IN ('direccion', 'gabinete')`),
  ]
);
export type AgtDepartment = typeof agtDepartments.$inferSelect;

export const agtConversations = pgTable(
  'agt_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agtAgents.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    peer: varchar('peer', { length: 200 }).notNull(),
    peerName: varchar('peer_name', { length: 255 }),
    summary: text('summary'),
    lastMessageAt: timestamp('last_message_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('agt_conversations_peer_unique').on(table.tenantId, table.agentId, table.channel, table.peer),
    check('agt_conversations_channel_check', sql`${table.channel} IN ('telegram', 'email', 'web')`),
  ]
);
export type AgtConversation = typeof agtConversations.$inferSelect;

export const agtMessages = pgTable(
  'agt_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agtConversations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 12 }).notNull(),
    content: text('content').notNull().default(''),
    audio: jsonb('audio'),
    toolCalls: jsonb('tool_calls'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('agt_messages_conversation_idx').on(table.conversationId, table.createdAt),
    check('agt_messages_role_check', sql`${table.role} IN ('user', 'assistant')`),
  ]
);
export type AgtMessage = typeof agtMessages.$inferSelect;

export const agtJobs = pgTable(
  'agt_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agtAgents.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => agtConversations.id, { onDelete: 'set null' }),
    requestedBy: varchar('requested_by', { length: 255 }).notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    instruction: text('instruction').notNull(),
    input: jsonb('input').notNull().default({}),
    status: varchar('status', { length: 20 }).notNull().default('en_cola'),
    result: text('result'),
    error: text('error'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    attempts: integer('attempts').notNull().default(0),
    claimedAt: timestamp('claimed_at'),
    finishedAt: timestamp('finished_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('agt_jobs_status_idx').on(table.tenantId, table.status, table.createdAt),
    check('agt_jobs_status_check', sql`${table.status} IN ('en_cola', 'trabajando', 'hecho', 'fallido', 'cancelado')`),
  ]
);
export type AgtJob = typeof agtJobs.$inferSelect;

export const agtIntegrations = pgTable(
  'agt_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('conectada'),
    credentials: text('credentials'),
    config: jsonb('config').notNull().default({}),
    lastOkAt: timestamp('last_ok_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('agt_integrations_provider_unique').on(table.tenantId, table.provider),
    check('agt_integrations_status_check', sql`${table.status} IN ('conectada', 'error', 'pendiente')`),
  ]
);
export type AgtIntegration = typeof agtIntegrations.$inferSelect;

// Preguntas del equipo al jefe de Operaciones (20 nov 2026, fase 2 de docs/DISENO-JEFE-OPERACIONES.md). Cada duda que un
// miembro del equipo escribe por su chat: de dónde salió la respuesta, si sirvió, si se escaló a Enric y lo que corrigió
// (para aprender). request_id no lleva clave foránea: el encargo es del módulo Operaciones.
export const agtTeamQuestions = pgTable(
  'agt_team_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    askedByClickupId: varchar('asked_by_clickup_id', { length: 50 }),
    askedByName: varchar('asked_by_name', { length: 255 }).notNull(),
    chatId: varchar('chat_id', { length: 40 }).notNull(),
    requestId: uuid('request_id'),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    question: text('question').notNull(),
    followups: jsonb('followups').notNull().default([]),
    // respondida | pendiente_aprobacion | escalada | resuelta | cerrada | descartada
    status: varchar('status', { length: 22 }).notNull().default('respondida'),
    // ficha | base | casos | general | enric
    tier: varchar('tier', { length: 10 }),
    // Área del tema (la pone el agente al responder): cuenta los intentos sin resolver de una persona.
    topicKey: varchar('topic_key', { length: 60 }),
    sources: jsonb('sources').notNull().default([]),
    toolCalls: jsonb('tool_calls').notNull().default([]),
    aiFirstAnswer: text('ai_first_answer'),
    aiAnswer: text('ai_answer'),
    revisions: jsonb('revisions').notNull().default([]),
    finalAnswer: text('final_answer'),
    // ia | enric
    answeredBy: varchar('answered_by', { length: 8 }),
    // sirve | no_sirve
    feedback: varchar('feedback', { length: 10 }),
    feedbackNote: text('feedback_note'),
    // no_sirve | pide_enric | tema_sensible | sin_respuesta | intentos
    escalationReason: varchar('escalation_reason', { length: 16 }),
    escalatedAt: timestamp('escalated_at'),
    awaitingChatId: varchar('awaiting_chat_id', { length: 40 }),
    // nota (la persona dice qué probó) | cambio (indicación de Enric) | respuesta (Enric responde)
    awaitingKind: varchar('awaiting_kind', { length: 12 }),
    kbArticleId: uuid('kb_article_id').references(() => kbArticles.id, { onDelete: 'set null' }),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingModel: varchar('embedding_model', { length: 80 }),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    answeredAt: timestamp('answered_at'),
    closedAt: timestamp('closed_at'),
  },
  (table) => [
    index('agt_team_questions_status_idx').on(table.tenantId, table.status, table.createdAt),
    index('agt_team_questions_person_idx').on(table.tenantId, table.chatId, table.createdAt),
    check('agt_team_questions_status_check', sql`${table.status} IN ('respondida', 'pendiente_aprobacion', 'escalada', 'resuelta', 'cerrada', 'descartada')`),
    check('agt_team_questions_tier_check', sql`${table.tier} IS NULL OR ${table.tier} IN ('ficha', 'base', 'casos', 'general', 'enric')`),
  ]
);
export type AgtTeamQuestion = typeof agtTeamQuestions.$inferSelect;

// --- Módulo Rendimiento (0049): histórico diario de Search Console, Analytics 4 y Business Profile por cliente ---------
// Lo llena lib/rendimiento/sync.ts con las fuentes de métricas que registran otros módulos en el núcleo (Agentes: Google).

export const perfDaily = pgTable(
  'perf_daily',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 10 }).notNull(), // gsc | ga4 | gbp
    property: varchar('property', { length: 200 }).notNull(),
    date: date('date').notNull(),
    metric: varchar('metric', { length: 40 }).notNull(),
    dimType: varchar('dim_type', { length: 20 }).notNull().default(''),
    dimValue: varchar('dim_value', { length: 120 }).notNull().default(''),
    value: doublePrecision('value').notNull()
  },
  (table) => [
    primaryKey({ name: 'perf_daily_pk', columns: [table.clientId, table.source, table.property, table.date, table.metric, table.dimType, table.dimValue] }),
    index('perf_daily_tenant_idx').on(table.tenantId, table.source, table.metric, table.date),
    check('perf_daily_source_check', sql`${table.source} IN ('gsc', 'ga4', 'gbp')`)
  ]
);
export type PerfDaily = typeof perfDaily.$inferSelect;

export const perfGscMonthly = pgTable(
  'perf_gsc_monthly',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    property: varchar('property', { length: 200 }).notNull(),
    month: date('month').notNull(),
    kind: varchar('kind', { length: 10 }).notNull(), // query | page
    key: text('key').notNull(),
    clicks: integer('clicks').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    ctr: doublePrecision('ctr').notNull().default(0),
    position: doublePrecision('position').notNull().default(0)
  },
  (table) => [
    primaryKey({ name: 'perf_gsc_monthly_pk', columns: [table.clientId, table.property, table.month, table.kind, table.key] }),
    check('perf_gsc_monthly_kind_check', sql`${table.kind} IN ('query', 'page')`)
  ]
);
export type PerfGscMonthly = typeof perfGscMonthly.$inferSelect;

export type PerfSyncState = { cursor?: string; empty?: number; months?: string[]; lastFetchedRows?: number };

export const perfSync = pgTable(
  'perf_sync',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 10 }).notNull(),
    property: varchar('property', { length: 200 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pendiente'),
    historyFrom: date('history_from'),
    syncedUntil: date('synced_until'),
    backfillDone: boolean('backfill_done').notNull().default(false),
    state: jsonb('state').$type<PerfSyncState>().notNull().default({}),
    lastDailyOn: date('last_daily_on'),
    lastRunAt: timestamp('last_run_at'),
    nextAttemptAt: timestamp('next_attempt_at'),
    lastError: text('last_error'),
    errorCount: integer('error_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    unique('perf_sync_property_unique').on(table.clientId, table.source, table.property),
    index('perf_sync_tenant_idx').on(table.tenantId, table.status),
    check('perf_sync_source_check', sql`${table.source} IN ('gsc', 'ga4', 'gbp')`),
    check('perf_sync_status_check', sql`${table.status} IN ('pendiente', 'descargando', 'al_dia', 'error', 'inactiva')`)
  ]
);
export type PerfSync = typeof perfSync.$inferSelect;

export const perfAnnotations = pgTable(
  'perf_annotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    kind: varchar('kind', { length: 20 }).notNull().default('otro'),
    title: varchar('title', { length: 200 }).notNull(),
    notes: text('notes'),
    source: varchar('source', { length: 10 }).notNull().default('manual'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    index('perf_annotations_client_idx').on(table.clientId, table.date),
    check('perf_annotations_kind_check', sql`${table.kind} IN ('servicio', 'web', 'contenido', 'campana', 'google', 'otro')`),
    check('perf_annotations_source_check', sql`${table.source} IN ('manual', 'agente', 'sistema')`)
  ]
);
export type PerfAnnotation = typeof perfAnnotations.$inferSelect;

export type PerfSettingsState = { sentAlerts?: Record<string, string>; lastMonthly?: string; lastAlertsOn?: string };

export const perfSettings = pgTable('perf_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  alertsEnabled: boolean('alerts_enabled').notNull().default(true),
  alertPct: integer('alert_pct').notNull().default(30),
  alertRises: boolean('alert_rises').notNull().default(true),
  alertMinVolume: integer('alert_min_volume').notNull().default(20),
  monthlyReport: boolean('monthly_report').notNull().default(true),
  weeklySection: boolean('weekly_section').notNull().default(true),
  state: jsonb('state').$type<PerfSettingsState>().notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});
export type PerfSettings = typeof perfSettings.$inferSelect;

// --- Módulo Estrategia (15 nov 2026, fase 1; migración 0050; diseño en docs/DISENO-ESTRATEGIA-VIVA.md) -------------------
// Seguimiento por cliente según su plan: procesos con frecuencia editable (por plan y por cliente), objetivos medibles,
// palabras clave, salud de la web, señales, trabajo hecho y URLs trabajadas día a día.

export type EstProcessConfig = Record<string, { on: boolean; every: number }>;
/** Ajustes del estratega (fase 2): se guardan en est_settings.state para no tocar la tabla. */
export type EstStrategistSettings = { maxSuggestions?: number; alertsPerMonth?: number; expireDays?: number; snoozeDays?: number };
export type EstSettingsState = {
  lastExtractAt?: string;
  notified?: Record<string, string>;
  strategist?: EstStrategistSettings;
  /** Respuesta escrita que espera el estratega por Telegram, por chat: propuesta y qué se espera (ajuste o motivo). */
  awaiting?: Record<string, { id: string; mode: 'ajustar' | 'motivo'; at: string }>;
};

export const estSettings = pgTable(
  'est_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    onTrackPct: integer('on_track_pct').notNull().default(90),
    atRiskPct: integer('at_risk_pct').notNull().default(60),
    graceDays: integer('grace_days').notNull().default(90),
    strikingFrom: integer('striking_from').notNull().default(4),
    strikingTo: integer('striking_to').notNull().default(15),
    minImpressions: integer('min_impressions').notNull().default(100),
    alertsEnabled: boolean('alerts_enabled').notNull().default(true),
    askUrl: boolean('ask_url').notNull().default(true),
    trackDays: integer('track_days').notNull().default(180),
    aiMonthlyCapUsd: decimal('ai_monthly_cap_usd', { precision: 8, scale: 2 }).notNull().default('30'),
    state: jsonb('state').$type<EstSettingsState>().notNull().default({}),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    check('est_settings_pct_check', sql`${table.onTrackPct} BETWEEN 50 AND 100 AND ${table.atRiskPct} BETWEEN 10 AND 95 AND ${table.atRiskPct} < ${table.onTrackPct}`),
    check('est_settings_striking_check', sql`${table.strikingFrom} BETWEEN 1 AND 50 AND ${table.strikingTo} BETWEEN 2 AND 100 AND ${table.strikingFrom} < ${table.strikingTo}`)
  ]
);
export type EstSettings = typeof estSettings.$inferSelect;

export const estPlans = pgTable(
  'est_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description').notNull().default(''),
    processes: jsonb('processes').$type<EstProcessConfig>().notNull().default({}),
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [unique('est_plans_tenant_key_unique').on(table.tenantId, table.key)]
);
export type EstPlan = typeof estPlans.$inferSelect;

export const estClientSettings = pgTable(
  'est_client_settings',
  {
    clientId: uuid('client_id')
      .primaryKey()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => estPlans.id, { onDelete: 'restrict' }),
    overrides: jsonb('overrides').$type<EstProcessConfig>().notNull().default({}),
    pausedUntil: date('paused_until'),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [index('est_client_settings_tenant_idx').on(table.tenantId)]
);
export type EstClientSettings = typeof estClientSettings.$inferSelect;

export const estProcessRuns = pgTable(
  'est_process_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    process: varchar('process', { length: 30 }).notNull(),
    lastRunAt: timestamp('last_run_at'),
    nextRunAt: timestamp('next_run_at').notNull().defaultNow(),
    status: varchar('status', { length: 12 }).notNull().default('pendiente'),
    summary: text('summary'),
    lastError: text('last_error'),
    errorCount: integer('error_count').notNull().default(0),
    durationMs: integer('duration_ms')
  },
  (table) => [
    unique('est_process_runs_unique').on(table.clientId, table.process),
    index('est_process_runs_due_idx').on(table.tenantId, table.nextRunAt),
    check('est_process_runs_status_check', sql`${table.status} IN ('pendiente', 'ok', 'aviso', 'error', 'omitido')`)
  ]
);
export type EstProcessRun = typeof estProcessRuns.$inferSelect;

export const estObjectives = pgTable(
  'est_objectives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    kind: varchar('kind', { length: 10 }).notNull().default('kpi'),
    kpiKey: varchar('kpi_key', { length: 40 }),
    baselineValue: doublePrecision('baseline_value'),
    baselineYoy: doublePrecision('baseline_yoy'),
    targetValue: doublePrecision('target_value'),
    targetLow: doublePrecision('target_low'),
    targetHigh: doublePrecision('target_high'),
    curve: varchar('curve', { length: 10 }).notNull().default('s'),
    startDate: date('start_date').notNull(),
    dueDate: date('due_date').notNull(),
    status: varchar('status', { length: 12 }).notNull().default('activo'),
    lastHealth: varchar('last_health', { length: 12 }),
    lastHealthAt: timestamp('last_health_at'),
    lastValue: doublePrecision('last_value'),
    finalValue: doublePrecision('final_value'),
    closedAt: timestamp('closed_at'),
    priority: smallint('priority').notNull().default(2),
    notes: text('notes'),
    source: varchar('source', { length: 10 }).notNull().default('manual'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    index('est_objectives_client_idx').on(table.clientId, table.status),
    check('est_objectives_kind_check', sql`${table.kind} IN ('kpi', 'hito')`),
    check('est_objectives_curve_check', sql`${table.curve} IN ('s', 'lineal')`),
    check('est_objectives_status_check', sql`${table.status} IN ('activo', 'logrado', 'no_logrado', 'descartado')`),
    check('est_objectives_source_check', sql`${table.source} IN ('manual', 'agente', 'sistema')`),
    check('est_objectives_dates_check', sql`${table.dueDate} > ${table.startDate}`),
    check('est_objectives_kpi_check', sql`${table.kind} = 'hito' OR (${table.kpiKey} IS NOT NULL AND ${table.targetValue} IS NOT NULL)`)
  ]
);
export type EstObjective = typeof estObjectives.$inferSelect;

export const estKeywords = pgTable(
  'est_keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 200 }).notNull(),
    targetUrl: text('target_url'),
    critical: boolean('critical').notNull().default(false),
    active: boolean('active').notNull().default(true),
    lastPosition: doublePrecision('last_position'),
    prevPosition: doublePrecision('prev_position'),
    lastClicks: integer('last_clicks'),
    lastImpressions: integer('last_impressions'),
    lastCheckedOn: date('last_checked_on'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => [unique('est_keywords_unique').on(table.clientId, table.keyword)]
);
export type EstKeyword = typeof estKeywords.$inferSelect;

export const estKeywordHistory = pgTable(
  'est_keyword_history',
  {
    keywordId: uuid('keyword_id')
      .notNull()
      .references(() => estKeywords.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    position: doublePrecision('position').notNull(),
    clicks: integer('clicks').notNull().default(0),
    impressions: integer('impressions').notNull().default(0)
  },
  (table) => [primaryKey({ name: 'est_keyword_history_pk', columns: [table.keywordId, table.date] })]
);

export type EstIssue = { code: string; severity: 'info' | 'aviso' | 'critico'; url?: string; detail: string };

export const estHealthChecks = pgTable(
  'est_health_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 12 }).notNull(),
    checkedAt: timestamp('checked_at').notNull().defaultNow(),
    status: varchar('status', { length: 10 }).notNull(),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
    issues: jsonb('issues').$type<EstIssue[]>().notNull().default([])
  },
  (table) => [
    index('est_health_checks_client_idx').on(table.clientId, table.kind, table.checkedAt),
    check('est_health_checks_kind_check', sql`${table.kind} IN ('critico', 'salud', 'velocidad')`),
    check('est_health_checks_status_check', sql`${table.status} IN ('ok', 'aviso', 'critico')`)
  ]
);
export type EstHealthCheck = typeof estHealthChecks.$inferSelect;

export const estSignals = pgTable(
  'est_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 30 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 300 }).notNull(),
    severity: varchar('severity', { length: 10 }).notNull().default('info'),
    title: varchar('title', { length: 300 }).notNull(),
    detail: text('detail'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 12 }).notNull().default('abierta'),
    firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    notifiedAt: timestamp('notified_at')
  },
  (table) => [
    unique('est_signals_unique').on(table.clientId, table.dedupeKey),
    index('est_signals_tenant_idx').on(table.tenantId, table.status, table.severity),
    check('est_signals_severity_check', sql`${table.severity} IN ('info', 'aviso', 'critico')`),
    check('est_signals_status_check', sql`${table.status} IN ('abierta', 'atendida', 'descartada', 'resuelta')`)
  ]
);
export type EstSignal = typeof estSignals.$inferSelect;

export const estWorkFacts = pgTable(
  'est_work_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    taskId: varchar('task_id', { length: 60 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    category: varchar('category', { length: 20 }).notNull().default('otro'),
    urls: jsonb('urls').$type<string[]>().notNull().default([]),
    keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
    kpis: jsonb('kpis').$type<string[]>().notNull().default([]),
    hours: decimal('hours', { precision: 6, scale: 2 }),
    doneOn: date('done_on').notNull(),
    needsUrl: boolean('needs_url').notNull().default(false),
    urlStatus: varchar('url_status', { length: 12 }).notNull().default('no_aplica'),
    urlAskedAt: timestamp('url_asked_at'),
    extraction: varchar('extraction', { length: 10 }).notNull().default('ia'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    unique('est_work_facts_unique').on(table.tenantId, table.taskId),
    index('est_work_facts_client_idx').on(table.clientId, table.doneOn),
    check('est_work_facts_category_check', sql`${table.category} IN ('contenido', 'onpage', 'tecnico', 'enlaces', 'gbp', 'web', 'campana', 'informe', 'otro')`),
    check('est_work_facts_url_check', sql`${table.urlStatus} IN ('no_aplica', 'falta', 'preguntada', 'respondida')`),
    check('est_work_facts_extraction_check', sql`${table.extraction} IN ('ia', 'reglas', 'manual')`)
  ]
);
export type EstWorkFact = typeof estWorkFacts.$inferSelect;

export const estTrackedUrls = pgTable(
  'est_tracked_urls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    property: varchar('property', { length: 300 }).notNull(),
    reason: varchar('reason', { length: 300 }),
    workFactId: uuid('work_fact_id').references(() => estWorkFacts.id, { onDelete: 'set null' }),
    changedOn: date('changed_on').notNull(),
    crawledOn: date('crawled_on'),
    lastInspectedAt: timestamp('last_inspected_at'),
    indexState: varchar('index_state', { length: 60 }),
    backfilled: boolean('backfilled').notNull().default(false),
    lastSyncedOn: date('last_synced_on'),
    activeUntil: date('active_until').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => [unique('est_tracked_urls_unique').on(table.clientId, table.url)]
);
export type EstTrackedUrl = typeof estTrackedUrls.$inferSelect;

export const estUrlDaily = pgTable(
  'est_url_daily',
  {
    trackedUrlId: uuid('tracked_url_id')
      .notNull()
      .references(() => estTrackedUrls.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    clicks: integer('clicks').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    ctr: doublePrecision('ctr').notNull().default(0),
    position: doublePrecision('position').notNull().default(0)
  },
  (table) => [primaryKey({ name: 'est_url_daily_pk', columns: [table.trackedUrlId, table.date] })]
);

export const estEvents = pgTable(
  'est_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    endDate: date('end_date'),
    kind: varchar('kind', { length: 10 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    notes: text('notes'),
    source: varchar('source', { length: 10 }).notNull().default('manual'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => [
    index('est_events_tenant_idx').on(table.tenantId, table.date),
    check('est_events_kind_check', sql`${table.kind} IN ('google', 'festivo', 'datos', 'otro')`),
    check('est_events_source_check', sql`${table.source} IN ('manual', 'sistema')`),
    check('est_events_dates_check', sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.date}`)
  ]
);
export type EstEvent = typeof estEvents.$inferSelect;
export type EstEvidence = { tipo: string; ref: string; periodo: string; dato: string };
export type EstExpected = { metrica?: string; donde?: string; cambio_pct?: number; dias?: number };

export const estAnalyses = pgTable(
  'est_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Hito 2 SEO (0062): análisis de un proyecto concreto (null = del cliente entero, como hasta ahora).
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    trigger: varchar('trigger', { length: 12 }).notNull().default('programado'),
    reason: text('reason'),
    status: varchar('status', { length: 12 }).notNull().default('pendiente'),
    summary: text('summary'),
    diagnosis: jsonb('diagnosis').$type<{ diagnostico: string[]; aprendizajes: string[] } | string[]>().notNull().default([]),
    discarded: jsonb('discarded').$type<{ title: string; reason: string }[]>().notNull().default([]),
    proposed: integer('proposed').notNull().default(0),
    dossierChars: integer('dossier_chars'),
    model: varchar('model', { length: 80 }),
    aiJobId: uuid('ai_job_id'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    error: text('error'),
    requestedBy: varchar('requested_by', { length: 120 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at')
  },
  (table) => [
    index('est_analyses_client_idx').on(table.clientId, table.createdAt),
    index('est_analyses_tenant_idx').on(table.tenantId, table.status, table.createdAt),
    check('est_analyses_trigger_check', sql`${table.trigger} IN ('programado', 'alerta', 'manual')`),
    check('est_analyses_status_check', sql`${table.status} IN ('pendiente', 'en_curso', 'hecho', 'error', 'omitido')`)
  ]
);
export type EstAnalysis = typeof estAnalyses.$inferSelect;

export const estSuggestions = pgTable(
  'est_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => estAnalyses.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    objectiveId: uuid('objective_id').references(() => estObjectives.id, { onDelete: 'set null' }),
    rank: smallint('rank').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    workType: varchar('work_type', { length: 40 }),
    category: varchar('category', { length: 20 }).notNull().default('otro'),
    evidence: jsonb('evidence').$type<EstEvidence[]>().notNull().default([]),
    expected: jsonb('expected').$type<EstExpected>().notNull().default({}),
    impact: smallint('impact').notNull(),
    confidence: smallint('confidence').notNull(),
    hours: decimal('hours', { precision: 6, scale: 2 }).notNull(),
    hoursAi: decimal('hours_ai', { precision: 6, scale: 2 }),
    hoursSource: varchar('hours_source', { length: 10 }).notNull().default('ia'),
    ice: decimal('ice', { precision: 8, scale: 3 }).notNull(),
    status: varchar('status', { length: 12 }).notNull().default('pendiente'),
    rejectReason: varchar('reject_reason', { length: 20 }),
    rejectNote: text('reject_note'),
    adjustNote: text('adjust_note'),
    decidedBy: varchar('decided_by', { length: 120 }),
    decidedAt: timestamp('decided_at'),
    snoozeUntil: date('snooze_until'),
    taskRef: varchar('task_ref', { length: 60 }),
    taskUrl: text('task_url'),
    taskError: text('task_error'),
    executedAt: timestamp('executed_at'),
    actual: jsonb('actual').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    index('est_suggestions_client_idx').on(table.clientId, table.status, table.createdAt),
    index('est_suggestions_tenant_idx').on(table.tenantId, table.status, table.createdAt),
    index('est_suggestions_analysis_idx').on(table.analysisId, table.rank),
    index('est_suggestions_task_idx').on(table.tenantId, table.taskRef),
    check('est_suggestions_status_check', sql`${table.status} IN ('pendiente', 'aprobada', 'ajustada', 'aplazada', 'rechazada', 'caducada')`),
    check('est_suggestions_reason_check', sql`${table.rejectReason} IS NULL OR ${table.rejectReason} IN ('ya_hecho', 'no_encaja', 'poco_impacto', 'sin_horas', 'otro')`),
    check('est_suggestions_scores_check', sql`${table.impact} BETWEEN 1 AND 10 AND ${table.confidence} BETWEEN 1 AND 10 AND ${table.hours} > 0`),
    check('est_suggestions_hours_source_check', sql`${table.hoursSource} IN ('equipo', 'ia')`),
    check('est_suggestions_category_check', sql`${table.category} IN ('contenido', 'onpage', 'tecnico', 'enlaces', 'gbp', 'web', 'campana', 'informe', 'otro')`)
  ]
);
export type EstSuggestion = typeof estSuggestions.$inferSelect;

// --- Registro central de errores (núcleo, 17 nov 2026, migración 0052) -----------------------------------------------
// Todo fallo de la herramienta (consola del servidor, peticiones de Next, IA, herramientas de los agentes, navegador)
// queda aquí agrupado por «huella» para investigarlo y arreglarlo; el Técnico de mantenimiento (subagente) lo diagnostica.
// tenant_id nulo = error del sistema sin cuenta conocida (solo lo ve el super_admin).
export const sysErrorGroups = pgTable(
  'sys_error_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    source: varchar('source', { length: 40 }).notNull(),
    area: varchar('area', { length: 120 }).notNull().default(''),
    title: varchar('title', { length: 300 }).notNull(),
    severity: varchar('severity', { length: 10 }).notNull().default('error'),
    status: varchar('status', { length: 14 }).notNull().default('nuevo'),
    occurrences: integer('occurrences').notNull().default(0),
    reopenedCount: integer('reopened_count').notNull().default(0),
    firstSeen: timestamp('first_seen').notNull().defaultNow(),
    lastSeen: timestamp('last_seen').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: varchar('resolved_by', { length: 160 }),
    note: text('note'),
    diagnosis: jsonb('diagnosis'),
    diagnosisAt: timestamp('diagnosis_at'),
    diagnosisJobId: uuid('diagnosis_job_id'),
    diagnosisRequestedAt: timestamp('diagnosis_requested_at'),
    notifiedAt: timestamp('notified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sys_error_groups_fingerprint_unique').on(table.fingerprint),
    index('sys_error_groups_tenant_idx').on(table.tenantId, table.status, table.lastSeen),
    index('sys_error_groups_last_seen_idx').on(table.lastSeen),
    check('sys_error_groups_severity_check', sql`${table.severity} IN ('aviso', 'error', 'critico')`),
    check('sys_error_groups_status_check', sql`${table.status} IN ('nuevo', 'investigando', 'resuelto', 'ignorado')`),
  ]
);
export type SysErrorGroup = typeof sysErrorGroups.$inferSelect;

export const sysErrorEvents = pgTable(
  'sys_error_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => sysErrorGroups.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    message: text('message').notNull().default(''),
    stack: text('stack'),
    userMessage: text('user_message'),
    context: jsonb('context').notNull().default({}),
    actor: varchar('actor', { length: 160 }),
    channel: varchar('channel', { length: 20 }),
    path: varchar('path', { length: 300 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('sys_error_events_group_idx').on(table.groupId, table.createdAt),
    index('sys_error_events_created_idx').on(table.createdAt),
  ]
);
export type SysErrorEvent = typeof sysErrorEvents.$inferSelect;

export const sysErrorSettings = pgTable('sys_error_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  alerts: boolean('alerts').notNull().default(true),
  alertMinSeverity: varchar('alert_min_severity', { length: 10 }).notNull().default('error'),
  autoDiagnose: boolean('auto_diagnose').notNull().default(true),
  maxDiagnosesPerDay: integer('max_diagnoses_per_day').notNull().default(2),
  retentionDays: integer('retention_days').notNull().default(60),
  state: jsonb('state').notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export type SysErrorSettings = typeof sysErrorSettings.$inferSelect;

// ---------------------------------------------------------------------------
// Pruebas simuladas (Operaciones, 19 nov 2026). Un ENTORNO DE PRUEBAS es otra cuenta (tenant) aislada, con un bot y un
// ClickUp «centinela» que nunca salen a internet (lib/operaciones/sim/). Aquí: qué cuenta de pruebas tiene cada cuenta,
// cada ejecución de un escenario y la conversación simulada de Telegram.
// ---------------------------------------------------------------------------
export const opsSimEnvironments = pgTable('ops_sim_environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  // La cuenta real (Kijutech) que es dueña del entorno.
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  // La cuenta de pruebas: todo lo simulado vive en ella, separado por las mismas reglas que separan dos cuentas.
  simTenantId: uuid('sim_tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type OpsSimEnvironment = typeof opsSimEnvironments.$inferSelect;

export const opsSimRuns = pgTable(
  'ops_sim_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // La cuenta real que lo ve en Sistema → Pruebas.
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    scenarioKey: varchar('scenario_key', { length: 60 }).notNull(),
    status: varchar('status', { length: 10 }).notNull().default('en_curso'),
    // claude | manual | despliegue
    trigger: varchar('trigger', { length: 12 }).notNull().default('manual'),
    triggeredBy: varchar('triggered_by', { length: 255 }),
    // [{ label, ok, detail }]: lo que comprobó, paso a paso.
    steps: jsonb('steps').notNull().default([]),
    error: text('error'),
    commit: varchar('commit', { length: 20 }),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [
    index('ops_sim_runs_tenant_scenario_idx').on(table.tenantId, table.scenarioKey, table.startedAt),
    check('ops_sim_runs_status_check', sql`${table.status} IN ('en_curso', 'ok', 'fallo')`),
    check('ops_sim_runs_trigger_check', sql`${table.trigger} IN ('claude', 'manual', 'despliegue')`),
  ]
);
export type OpsSimRun = typeof opsSimRuns.$inferSelect;

export const opsSimMessages = pgTable(
  'ops_sim_messages',
  {
    // También es el message_id que ve el bot (así editar o borrar un mensaje simulado es por su id).
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // La cuenta de pruebas.
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    // bot (lo que manda el bot) | persona (lo que escribe o pulsa la persona simulada) | aviso (ventanita de un botón)
    direction: varchar('direction', { length: 8 }).notNull(),
    text: text('text').notNull().default(''),
    // Botones tal como los manda el bot: [[{ text, callback_data }]].
    buttons: jsonb('buttons'),
    runId: uuid('run_id').references(() => opsSimRuns.id, { onDelete: 'set null' }),
    editedAt: timestamp('edited_at'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('ops_sim_messages_chat_idx').on(table.tenantId, table.chatId, table.id),
    index('ops_sim_messages_run_idx').on(table.runId),
    check('ops_sim_messages_direction_check', sql`${table.direction} IN ('bot', 'persona', 'aviso')`),
  ]
);
export type OpsSimMessage = typeof opsSimMessages.$inferSelect;

// =====================================================================================================================
// CIMIENTOS DE LA PLATAFORMA (núcleo, 23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md). Los usan SEO y, después, Ads.
// =====================================================================================================================

// Alcance de un proyecto: qué webs, propiedades de Google, fichas y redes del cliente son suyas.
export const projectAssets = pgTable(
  'project_assets',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    clientAssetId: uuid('client_asset_id')
      .notNull()
      .references(() => clientAssets.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 12 }).notNull().default('principal'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.clientAssetId] }),
    index('project_assets_asset_idx').on(table.clientAssetId),
    check('project_assets_role_check', sql`${table.role} IN ('principal', 'secundario')`),
  ]
);
export type ProjectAsset = typeof projectAssets.$inferSelect;

// Qué comunicaciones recibe cada contacto del cliente (por tipo; opcionalmente solo de un proyecto).
export const clientContactSubscriptions = pgTable(
  'client_contact_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => clientContacts.id, { onDelete: 'cascade' }),
    // informes | preguntas | avisos | aprobaciones | facturacion | todo
    kind: varchar('kind', { length: 16 }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('client_contact_subs_unique').on(table.contactId, table.kind, sql`coalesce(${table.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    index('client_contact_subs_tenant_idx').on(table.tenantId),
    check('client_contact_subs_kind_check', sql`${table.kind} IN ('informes', 'preguntas', 'avisos', 'aprobaciones', 'facturacion', 'todo')`),
  ]
);
export type ClientContactSubscription = typeof clientContactSubscriptions.$inferSelect;

// Todo lo que sale hacia un cliente, lo escriba quien lo escriba (persona, agente o sistema).
export const clientMessages = pgTable(
  'client_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    kind: varchar('kind', { length: 16 }).notNull(),
    subject: varchar('subject', { length: 300 }).notNull(),
    bodyText: text('body_text').notNull(),
    toContactIds: uuid('to_contact_ids').array().notNull(),
    ccContactIds: uuid('cc_contact_ids').array().notNull().default(sql`'{}'::uuid[]`),
    // persona | agente | sistema
    authorKind: varchar('author_kind', { length: 10 }).notNull(),
    authorName: varchar('author_name', { length: 255 }).notNull(),
    authorUserId: integer('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    authorAgentKey: varchar('author_agent_key', { length: 60 }),
    // borrador | pendiente_aprobacion | aprobado | enviado | rechazado | fallido
    status: varchar('status', { length: 22 }).notNull(),
    approvalRequired: boolean('approval_required').notNull(),
    decidedBy: varchar('decided_by', { length: 255 }),
    decidedAt: timestamp('decided_at'),
    rejectReason: text('reject_reason'),
    sentAt: timestamp('sent_at'),
    providerMessageId: varchar('provider_message_id', { length: 300 }),
    lastError: text('last_error'),
    // Hilo: las respuestas que entran por el buzón se unen por aquí (Message-ID / In-Reply-To).
    threadKey: varchar('thread_key', { length: 300 }).notNull(),
    replyToInboundId: uuid('reply_to_inbound_id'),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('client_messages_dedupe_unique').on(table.tenantId, table.dedupeKey),
    index('client_messages_status_idx').on(table.tenantId, table.status),
    index('client_messages_client_idx').on(table.clientId, table.createdAt),
    index('client_messages_thread_idx').on(table.threadKey),
    check('client_messages_kind_check', sql`${table.kind} IN ('informes', 'preguntas', 'avisos', 'aprobaciones', 'facturacion')`),
    check('client_messages_author_check', sql`${table.authorKind} IN ('persona', 'agente', 'sistema')`),
    check('client_messages_status_check', sql`${table.status} IN ('borrador', 'pendiente_aprobacion', 'aprobado', 'enviado', 'rechazado', 'fallido')`),
  ]
);
export type ClientMessage = typeof clientMessages.$inferSelect;

// Preguntas al cliente (25 nov 2026, migración 0064, aprobado por Enric; docs/DISENO-PREGUNTAS-CLIENTE.md).
// Banco editable por servicio (null = General): de aquí salen las preguntas de cada cliente según lo que le hacemos.
export const clientQuestionTemplates = pgTable(
  'client_question_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Clave del servicio (ops_services.key, validada en el código); null = General (a todos los clientes).
    serviceKey: varchar('service_key', { length: 40 }),
    text: text('text').notNull(),
    // Para qué la preguntamos: ayuda al cliente en el cuestionario y a la IA al leer la respuesta.
    help: text('help'),
    // texto | lista | si_no | numero | direccion | fecha
    answerType: varchar('answer_type', { length: 12 }).notNull().default('texto'),
    // Dónde se guarda la respuesta: memoria[.tipo] | ficha.<campo> (validado en el código).
    target: varchar('target', { length: 60 }).notNull().default('memoria'),
    // alta (una vez, al empezar) | periodica (otra vez cada repeat_days días tras responderla)
    askWhen: varchar('ask_when', { length: 12 }).notNull().default('alta'),
    repeatDays: integer('repeat_days'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    // sistema (banco inicial) | manual | ia (propuesta por la IA y aceptada por una persona)
    origin: varchar('origin', { length: 10 }).notNull().default('manual'),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('client_question_templates_tenant_idx').on(table.tenantId, table.serviceKey, table.sortOrder),
    check('client_question_templates_type_check', sql`${table.answerType} IN ('texto', 'lista', 'si_no', 'numero', 'direccion', 'fecha')`),
    check('client_question_templates_when_check', sql`${table.askWhen} IN ('alta', 'periodica')`),
    check('client_question_templates_repeat_check', sql`${table.repeatDays} IS NULL OR ${table.repeatDays} BETWEEN 7 AND 730`),
    check('client_question_templates_origin_check', sql`${table.origin} IN ('sistema', 'manual', 'ia')`),
  ]
);
export type ClientQuestionTemplate = typeof clientQuestionTemplates.$inferSelect;

// Cuestionario en línea: enlace privado (solo se guarda el hash del token) que caduca.
export const clientQuestionnaires = pgTable(
  'client_questionnaires',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    // activo | completado | anulado
    status: varchar('status', { length: 12 }).notNull().default('activo'),
    expiresAt: timestamp('expires_at').notNull(),
    messageId: uuid('message_id').references(() => clientMessages.id, { onDelete: 'set null' }),
    createdByName: varchar('created_by_name', { length: 255 }),
    lastSeenAt: timestamp('last_seen_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('client_questionnaires_token_unique').on(table.tokenHash),
    index('client_questionnaires_client_idx').on(table.clientId, table.status),
    check('client_questionnaires_status_check', sql`${table.status} IN ('activo', 'completado', 'anulado')`),
  ]
);
export type ClientQuestionnaire = typeof clientQuestionnaires.$inferSelect;

// Las preguntas de cada cliente: del banco (por sus servicios), sueltas (solo para él) o de un dato que le falta a un
// módulo (p. ej. el expediente SEO). Guardan su texto (editable por cliente), su estado y la respuesta con su cita.
export const clientQuestions = pgTable(
  'client_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // banco | suelta | dato
    origin: varchar('origin', { length: 10 }).notNull(),
    templateId: uuid('template_id').references(() => clientQuestionTemplates.id, { onDelete: 'set null' }),
    // Pregunta de un módulo («seo:<proyecto>:telefono»): quien la registró recibe la respuesta.
    sourceKey: varchar('source_key', { length: 120 }),
    serviceKey: varchar('service_key', { length: 40 }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    help: text('help'),
    // El texto se cambió solo para este cliente: el banco ya no lo pisa.
    customText: boolean('custom_text').notNull().default(false),
    answerType: varchar('answer_type', { length: 12 }).notNull().default('texto'),
    target: varchar('target', { length: 120 }).notNull().default('memoria'),
    // pendiente | enviada | respondida | no_aplica
    status: varchar('status', { length: 12 }).notNull().default('pendiente'),
    answer: jsonb('answer'),
    answerText: text('answer_text'),
    answerQuote: text('answer_quote'),
    // correo | cuestionario | manual
    answeredVia: varchar('answered_via', { length: 12 }),
    answeredBy: varchar('answered_by', { length: 255 }),
    answeredAt: timestamp('answered_at'),
    // aplicada | distinta (la ficha dice otra cosa) | no (no se guarda en la ficha)
    applied: varchar('applied', { length: 10 }),
    askedAt: timestamp('asked_at'),
    messageId: uuid('message_id').references(() => clientMessages.id, { onDelete: 'set null' }),
    questionnaireId: uuid('questionnaire_id').references(() => clientQuestionnaires.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('client_questions_client_idx').on(table.tenantId, table.clientId, table.status),
    index('client_questions_message_idx').on(table.messageId),
    index('client_questions_questionnaire_idx').on(table.questionnaireId),
    // Como mucho una abierta (pendiente o enviada) por pregunta del banco y por dato de un módulo.
    uniqueIndex('client_questions_open_template_unique').on(table.clientId, table.templateId).where(sql`${table.templateId} IS NOT NULL AND ${table.status} IN ('pendiente', 'enviada')`),
    uniqueIndex('client_questions_open_source_unique').on(table.clientId, table.sourceKey).where(sql`${table.sourceKey} IS NOT NULL AND ${table.status} IN ('pendiente', 'enviada')`),
    check('client_questions_origin_check', sql`${table.origin} IN ('banco', 'suelta', 'dato')`),
    check('client_questions_type_check', sql`${table.answerType} IN ('texto', 'lista', 'si_no', 'numero', 'direccion', 'fecha')`),
    check('client_questions_status_check', sql`${table.status} IN ('pendiente', 'enviada', 'respondida', 'no_aplica')`),
    check('client_questions_via_check', sql`${table.answeredVia} IS NULL OR ${table.answeredVia} IN ('correo', 'cuestionario', 'manual')`),
    check('client_questions_applied_check', sql`${table.applied} IS NULL OR ${table.applied} IN ('aplicada', 'distinta', 'no')`),
  ]
);
export type ClientQuestion = typeof clientQuestions.$inferSelect;

// Textos editables de los correos a clientes (asunto y cuerpo con huecos {cliente}, {preguntas}, {enlace}…).
// Sin fila, se usa el texto por defecto del código.
export const clientCommsTemplates = pgTable(
  'client_comms_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    subject: varchar('subject', { length: 300 }).notNull(),
    body: text('body').notNull(),
    updatedBy: varchar('updated_by', { length: 255 }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('client_comms_templates_key_unique').on(table.tenantId, table.key)]
);
export type ClientCommsTemplate = typeof clientCommsTemplates.$inferSelect;

// Cola de trabajos: la reclama un trabajador (FOR UPDATE SKIP LOCKED), con latido, reintentos y concurrencia por tipo.
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 60 }).notNull(),
    // proyecto | cliente | cuenta
    scopeType: varchar('scope_type', { length: 10 }).notNull().default('cuenta'),
    scopeId: varchar('scope_id', { length: 64 }),
    payload: jsonb('payload').notNull().default({}),
    priority: smallint('priority').notNull().default(5),
    runAt: timestamp('run_at').notNull().defaultNow(),
    // pendiente | en_curso | hecho | fallido | cancelado
    status: varchar('status', { length: 10 }).notNull().default('pendiente'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lockedBy: varchar('locked_by', { length: 60 }),
    lockedAt: timestamp('locked_at'),
    heartbeatAt: timestamp('heartbeat_at'),
    timeoutS: integer('timeout_s').notNull().default(300),
    lastError: text('last_error'),
    result: jsonb('result'),
    dedupeKey: varchar('dedupe_key', { length: 200 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [
    index('jobs_ready_idx').on(table.runAt, table.priority).where(sql`${table.status} = 'pendiente'`),
    index('jobs_running_idx').on(table.kind).where(sql`${table.status} = 'en_curso'`),
    index('jobs_tenant_kind_idx').on(table.tenantId, table.kind, table.createdAt),
    uniqueIndex('jobs_dedupe_open_unique').on(table.tenantId, table.dedupeKey).where(sql`${table.dedupeKey} IS NOT NULL AND ${table.status} IN ('pendiente', 'en_curso')`),
    check('jobs_status_check', sql`${table.status} IN ('pendiente', 'en_curso', 'hecho', 'fallido', 'cancelado')`),
    check('jobs_scope_check', sql`${table.scopeType} IN ('proyecto', 'cliente', 'cuenta')`),
  ]
);
export type Job = typeof jobs.$inferSelect;

// Procesos periódicos: cada fila genera un trabajo cuando vence (generaliza est_process_runs).
export const jobSchedules = pgTable(
  'job_schedules',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    processKey: varchar('process_key', { length: 60 }).notNull(),
    scopeType: varchar('scope_type', { length: 10 }).notNull().default('cuenta'),
    // '' = toda la cuenta.
    scopeId: varchar('scope_id', { length: 64 }).notNull().default(''),
    everyMinutes: integer('every_minutes').notNull(),
    nextRunAt: timestamp('next_run_at').notNull().defaultNow(),
    lastRunAt: timestamp('last_run_at'),
    lastStatus: varchar('last_status', { length: 10 }),
    lastError: text('last_error'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    pausedUntil: timestamp('paused_until'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.processKey, table.scopeId] }),
    index('job_schedules_due_idx').on(table.nextRunAt).where(sql`${table.enabled}`),
  ]
);
export type JobSchedule = typeof jobSchedules.$inferSelect;

// --- Search Console en detalle ----------------------------------------------------------------------------------------
export const gscProperties = pgTable(
  'gsc_properties',
  {
    id: serial('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientAssetId: uuid('client_asset_id').references(() => clientAssets.id, { onDelete: 'set null' }),
    siteUrl: varchar('site_url', { length: 300 }).notNull(),
    // dominio | prefijo | plataforma
    kind: varchar('kind', { length: 12 }).notNull(),
    firstDate: date('first_date', { mode: 'string' }),
    lastDate: date('last_date', { mode: 'string' }),
    // Cursor de la descarga: { backfillTo, truncatedDays: [...] }.
    syncState: jsonb('sync_state').notNull().default({}),
    // activa | error | inactiva
    status: varchar('status', { length: 10 }).notNull().default('activa'),
    lastError: text('last_error'),
    lastSyncAt: timestamp('last_sync_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique('gsc_properties_site_unique').on(table.tenantId, table.siteUrl), check('gsc_properties_kind_check', sql`${table.kind} IN ('dominio', 'prefijo', 'plataforma')`)]
);
export type GscProperty = typeof gscProperties.$inferSelect;

export const gscQueries = pgTable(
  'gsc_queries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    propertyId: integer('property_id')
      .notNull()
      .references(() => gscProperties.id, { onDelete: 'cascade' }),
    query: text('query').notNull(),
    queryHash: varchar('query_hash', { length: 40 }).notNull(),
    branded: boolean('branded'),
    firstSeen: date('first_seen', { mode: 'string' }).notNull(),
  },
  (table) => [unique('gsc_queries_hash_unique').on(table.propertyId, table.queryHash)]
);

export const gscPages = pgTable(
  'gsc_pages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    propertyId: integer('property_id')
      .notNull()
      .references(() => gscProperties.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    urlHash: varchar('url_hash', { length: 40 }).notNull(),
    firstSeen: date('first_seen', { mode: 'string' }).notNull(),
  },
  (table) => [unique('gsc_pages_hash_unique').on(table.propertyId, table.urlHash)]
);

// Detalle diario (tabla PARTICIONADA por mes en la migración 0060; aquí solo para tipos y consultas).
// device: 1 móvil, 2 ordenador, 3 tableta. searchType: 1 web, 2 imágenes, 3 vídeo, 4 news, 5 discover, 6 googleNews.
// pos_sum = posición × impresiones (para agregar bien: posición = pos_sum / impresiones).
export const gscDaily = pgTable(
  'gsc_daily',
  {
    propertyId: integer('property_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    searchType: smallint('search_type').notNull(),
    device: smallint('device').notNull(),
    queryId: bigint('query_id', { mode: 'number' }).notNull(),
    pageId: bigint('page_id', { mode: 'number' }).notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    posSum: doublePrecision('pos_sum').notNull(),
  },
  (table) => [primaryKey({ columns: [table.propertyId, table.date, table.searchType, table.device, table.queryId, table.pageId] })]
);

// Totales del día sin dimensiones (para saber cuántos clics son de consultas anónimas).
export const gscDailyTotals = pgTable(
  'gsc_daily_totals',
  {
    propertyId: integer('property_id')
      .notNull()
      .references(() => gscProperties.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    searchType: smallint('search_type').notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    posSum: doublePrecision('pos_sum').notNull(),
    // Suma de las filas con consulta: la diferencia con el total son las anónimas.
    queryClicks: integer('query_clicks').notNull().default(0),
    truncated: boolean('truncated').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.propertyId, table.date, table.searchType] })]
);

export const gscDailyCountry = pgTable(
  'gsc_daily_country',
  {
    propertyId: integer('property_id')
      .notNull()
      .references(() => gscProperties.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    country: varchar('country', { length: 3 }).notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    posSum: doublePrecision('pos_sum').notNull(),
  },
  (table) => [primaryKey({ columns: [table.propertyId, table.date, table.country] })]
);

// Resumen mensual consulta × página (para siempre; el detalle diario se guarda 24 meses).
export const gscMonthly = pgTable(
  'gsc_monthly',
  {
    propertyId: integer('property_id')
      .notNull()
      .references(() => gscProperties.id, { onDelete: 'cascade' }),
    month: date('month', { mode: 'string' }).notNull(),
    queryId: bigint('query_id', { mode: 'number' }).notNull(),
    pageId: bigint('page_id', { mode: 'number' }).notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    posSum: doublePrecision('pos_sum').notNull(),
  },
  (table) => [primaryKey({ columns: [table.propertyId, table.month, table.queryId, table.pageId] }), index('gsc_monthly_page_idx').on(table.propertyId, table.pageId)]
);

// --- Rastreador -------------------------------------------------------------------------------------------------------
export const crawlRuns = pgTable(
  'crawl_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    // propio | competidor
    target: varchar('target', { length: 12 }).notNull().default('propio'),
    rootUrl: text('root_url').notNull(),
    // pendiente | en_curso | hecho | error
    status: varchar('status', { length: 10 }).notNull().default('pendiente'),
    maxPages: integer('max_pages').notNull().default(500),
    pagesDone: integer('pages_done').notNull().default(0),
    robotsTxt: text('robots_txt'),
    sitemaps: text('sitemaps').array(),
    // Frontera pendiente mientras dura (la vacía el trabajador).
    state: jsonb('state').notNull().default({}),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('crawl_runs_project_idx').on(table.projectId, table.target, table.createdAt),
    check('crawl_runs_target_check', sql`${table.target} IN ('propio', 'competidor')`),
    check('crawl_runs_status_check', sql`${table.status} IN ('pendiente', 'en_curso', 'hecho', 'error')`),
  ]
);
export type CrawlRun = typeof crawlRuns.$inferSelect;

export const crawlPages = pgTable(
  'crawl_pages',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => crawlRuns.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    urlHash: varchar('url_hash', { length: 40 }).notNull(),
    statusCode: integer('status_code'),
    redirectTo: text('redirect_to'),
    contentType: varchar('content_type', { length: 120 }),
    title: text('title'),
    metaDescription: text('meta_description'),
    h1: text('h1').array(),
    headings: jsonb('headings'),
    canonical: text('canonical'),
    robotsMeta: varchar('robots_meta', { length: 200 }),
    xRobots: varchar('x_robots', { length: 200 }),
    lang: varchar('lang', { length: 20 }),
    hreflang: jsonb('hreflang'),
    wordCount: integer('word_count'),
    contentHash: varchar('content_hash', { length: 40 }),
    simhash: varchar('simhash', { length: 16 }),
    linksInternal: integer('links_internal'),
    linksExternal: integer('links_external'),
    depth: integer('depth'),
    inSitemap: boolean('in_sitemap').notNull().default(false),
    jsonld: jsonb('jsonld'),
    schemaTypes: text('schema_types').array(),
    imagesWithoutAlt: integer('images_without_alt'),
    // Hechos acotados (0067): { ext: enlaces a otras webs (≤ 100), res: CSS y JS que carga (≤ 40) }.
    facts: jsonb('facts').$type<{ ext?: string[]; res?: string[]; gen?: string; sig?: string[] }>(),
    bytes: integer('bytes'),
    fetchMs: integer('fetch_ms'),
    error: text('error'),
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.urlHash] })]
);
export type CrawlPage = typeof crawlPages.$inferSelect;

export const crawlLinks = pgTable(
  'crawl_links',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => crawlRuns.id, { onDelete: 'cascade' }),
    fromHash: varchar('from_hash', { length: 40 }).notNull(),
    toHash: varchar('to_hash', { length: 40 }).notNull(),
    anchor: varchar('anchor', { length: 200 }),
    nofollow: boolean('nofollow').notNull().default(false),
  },
  (table) => [index('crawl_links_to_idx').on(table.runId, table.toHash), index('crawl_links_from_idx').on(table.runId, table.fromHash)]
);

// --- Hallazgos tipados ------------------------------------------------------------------------------------------------
export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 60 }).notNull(),
    ruleVersion: integer('rule_version').notNull().default(1),
    // info | aviso | importante | critico
    severity: varchar('severity', { length: 10 }).notNull(),
    // abierto | resuelto | descartado | aceptado
    status: varchar('status', { length: 10 }).notNull().default('abierto'),
    dedupeKey: varchar('dedupe_key', { length: 300 }).notNull(),
    url: text('url'),
    query: text('query'),
    metric: varchar('metric', { length: 40 }),
    value: doublePrecision('value'),
    evidence: jsonb('evidence').notNull().default({}),
    source: varchar('source', { length: 80 }).notNull(),
    requestId: uuid('request_id'),
    firstSeen: timestamp('first_seen').notNull().defaultNow(),
    lastSeen: timestamp('last_seen').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    dismissedBy: varchar('dismissed_by', { length: 255 }),
    dismissReason: text('dismiss_reason'),
  },
  (table) => [
    unique('findings_dedupe_unique').on(table.projectId, table.dedupeKey),
    index('findings_project_status_idx').on(table.projectId, table.status, table.severity),
    index('findings_project_kind_idx').on(table.projectId, table.kind),
    index('findings_project_url_idx').on(table.projectId, table.url),
    check('findings_severity_check', sql`${table.severity} IN ('info', 'aviso', 'importante', 'critico')`),
    check('findings_status_check', sql`${table.status} IN ('abierto', 'resuelto', 'descartado', 'aceptado')`),
  ]
);
export type Finding = typeof findings.$inferSelect;

// =====================================================================================================================
// HITO 1 SEO (23 nov 2026, migración 0061; docs/DISENO-TECNICO-HITO1.md, aprobado por Enric con la revisión del §9).
// =====================================================================================================================

// Núcleo: registro de intervenciones. Cada trabajo hecho (encargo) con su técnica y su hipótesis (qué métrica, en qué
// dirección, en cuánto tiempo), escrito al aprobarlo: es el dato que no se puede recuperar después. Lo escriben SEO
// (plan de mejora), Estrategia (propuestas aprobadas) y, después, Ads; la fecha de «hecho» la pone el núcleo
// preguntando a la fuente de trabajo. Sirve para medir qué técnicas funcionan, por tipo de negocio.
export type InterventionHypothesis = {
  metric?: string;
  direction?: 'sube' | 'baja';
  magnitudePct?: number;
  windowDays?: number;
  /** Cómo y cuándo se comprobará (SEO parte 1, 26 nov 2026): primero que está hecho (nueva auditoría o velocidad) y luego el efecto en Search Console. */
  verify?: { check: 'reauditoria' | 'velocidad' | 'gsc'; checkAfterDays: number; how: string };
};
export const interventions = pgTable(
  'interventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    // seo | ads | web | otro
    domain: varchar('domain', { length: 20 }).notNull(),
    // Clave de la taxonomía (lib/core/techniques.ts) y su versión.
    technique: varchar('technique', { length: 40 }).notNull(),
    taxonomyVersion: smallint('taxonomy_version').notNull().default(1),
    // Copia del tipo de negocio al registrarla (la ficha puede cambiar).
    businessType: varchar('business_type', { length: 60 }),
    urls: text('urls').array().notNull().default(sql`'{}'::text[]`),
    queries: text('queries').array().notNull().default(sql`'{}'::text[]`),
    hypothesis: jsonb('hypothesis').$type<InterventionHypothesis>().notNull().default({}),
    // Quién la registra y con qué id propio (p. ej. «seo.plan» + id de la propuesta, «estrategia» + id de la sugerencia).
    source: varchar('source', { length: 40 }).notNull(),
    sourceRef: varchar('source_ref', { length: 60 }).notNull(),
    // El encargo (id de la fuente de trabajo). Null = hecho sin encargo (p. ej. el propio cliente).
    requestRef: varchar('request_ref', { length: 60 }),
    // prevista | hecha | cancelada
    status: varchar('status', { length: 12 }).notNull().default('prevista'),
    doneAt: timestamp('done_at'),
    // Resultado medido (I+D fase B). Se deja preparado para no migrar otra vez.
    outcome: jsonb('outcome').$type<Record<string, unknown>>(),
    measuredAt: timestamp('measured_at'),
    createdBy: varchar('created_by', { length: 120 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('interventions_source_unique').on(table.tenantId, table.source, table.sourceRef),
    index('interventions_request_idx').on(table.tenantId, table.requestRef),
    index('interventions_technique_idx').on(table.tenantId, table.domain, table.technique, table.doneAt),
    index('interventions_client_idx').on(table.clientId, table.doneAt),
    check('interventions_domain_check', sql`${table.domain} IN ('seo', 'ads', 'web', 'otro')`),
    check('interventions_status_check', sql`${table.status} IN ('prevista', 'hecha', 'cancelada')`),
  ]
);
export type Intervention = typeof interventions.$inferSelect;

// Base de conocimiento (núcleo): bitácora de I+D. Lo publicado por fuentes oficiales (Google Search Central, panel de
// incidencias…), leído sin IA. Las core updates avisan al momento; una vez por semana se resume y, si merece la pena,
// se propone una entrada de la base (que solo publica Enric). Ads tendrá sus fuentes aquí (domain).
export const kbFeedItems = pgTable(
  'kb_feed_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    domain: varchar('domain', { length: 20 }).notNull(),
    sourceKey: varchar('source_key', { length: 40 }).notNull(),
    // Huella del elemento en su fuente (id, guid o hash de url+título): no se repite.
    hash: varchar('hash', { length: 64 }).notNull(),
    url: text('url'),
    title: varchar('title', { length: 500 }).notNull(),
    summary: text('summary'),
    publishedAt: timestamp('published_at'),
    // core_update | incidencia | documentacion | novedad
    kind: varchar('kind', { length: 20 }).notNull().default('novedad'),
    // Para una incidencia o core update: cuándo empieza y termina (si la fuente lo dice).
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    notifiedAt: timestamp('notified_at'),
    digestWeek: date('digest_week'),
    articleId: uuid('article_id').references(() => kbArticles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('kb_feed_items_unique').on(table.tenantId, table.sourceKey, table.hash),
    index('kb_feed_items_recent_idx').on(table.tenantId, table.domain, table.publishedAt),
    check('kb_feed_items_kind_check', sql`${table.kind} IN ('core_update', 'incidencia', 'documentacion', 'novedad')`),
  ]
);
export type KbFeedItem = typeof kbFeedItems.$inferSelect;

// SEO: expediente provisional del proyecto. Cada dato con origen, confianza y estado: el sistema lo recoge solo y una
// persona confirma. Lo confirmado que es del cliente (teléfono, dirección, tipo de negocio) se propone a la ficha del
// núcleo, nunca se sobrescribe solo.
export const seoDossierFacts = pgTable(
  'seo_dossier_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    field: varchar('field', { length: 40 }).notNull(),
    value: jsonb('value').notNull(),
    // ficha | web | places | wayback | gsc | busqueda | persona | ia | cliente (respuesta del cliente a las 3 preguntas, 0062)
    source: varchar('source', { length: 20 }).notNull(),
    sourceRef: text('source_ref'),
    confidence: smallint('confidence').notNull().default(50),
    // provisional | confirmado | descartado
    status: varchar('status', { length: 12 }).notNull().default('provisional'),
    decidedBy: varchar('decided_by', { length: 120 }),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('seo_dossier_facts_unique').on(table.projectId, table.field, table.source),
    check('seo_dossier_facts_source_check', sql`${table.source} IN ('ficha', 'web', 'places', 'wayback', 'gsc', 'busqueda', 'persona', 'ia', 'cliente')`),
    check('seo_dossier_facts_status_check', sql`${table.status} IN ('provisional', 'confirmado', 'descartado')`),
    check('seo_dossier_facts_confidence_check', sql`${table.confidence} BETWEEN 0 AND 100`),
  ]
);
export type SeoDossierFact = typeof seoDossierFacts.$inferSelect;

// SEO: plan de mejora del proyecto. Propuestas hechas por reglas a partir de los hallazgos abiertos (agrupadas por
// técnica, con horas y prioridad por impacto en Search Console). Al aprobarse, se convierten en encargo con el contrato
// del núcleo y se registra su intervención. «plan_key» evita duplicar al volver a generar el plan.
export const seoPlanItems = pgTable(
  'seo_plan_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    planKey: varchar('plan_key', { length: 120 }).notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description').notNull(),
    technique: varchar('technique', { length: 40 }).notNull(),
    findingIds: uuid('finding_ids').array().notNull().default(sql`'{}'::uuid[]`),
    urls: text('urls').array().notNull().default(sql`'{}'::text[]`),
    // 1 (alta) a 3 (baja)
    priority: smallint('priority').notNull().default(2),
    score: doublePrecision('score').notNull().default(0),
    estHours: decimal('est_hours', { precision: 5, scale: 1 }).notNull(),
    hypothesis: jsonb('hypothesis').$type<InterventionHypothesis>().notNull().default({}),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    // pendiente | aprobada | descartada | hecha | caducada
    status: varchar('status', { length: 12 }).notNull().default('pendiente'),
    requestRef: varchar('request_ref', { length: 60 }),
    requestUrl: text('request_url'),
    requestError: text('request_error'),
    decidedBy: varchar('decided_by', { length: 120 }),
    decidedAt: timestamp('decided_at'),
    rejectNote: text('reject_note'),
    // reglas | ia | persona
    origin: varchar('origin', { length: 10 }).notNull().default('reglas'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('seo_plan_items_key_unique').on(table.projectId, table.planKey),
    index('seo_plan_items_project_idx').on(table.projectId, table.status, table.priority),
    check('seo_plan_items_status_check', sql`${table.status} IN ('pendiente', 'aprobada', 'descartada', 'hecha', 'caducada')`),
    check('seo_plan_items_priority_check', sql`${table.priority} BETWEEN 1 AND 3`),
    check('seo_plan_items_origin_check', sql`${table.origin} IN ('reglas', 'ia', 'persona')`),
  ]
);
export type SeoPlanItem = typeof seoPlanItems.$inferSelect;

// SEO: reseñas de la ficha de Google del cliente (es del cliente, no del proyecto: varios proyectos comparten ficha).
// El borrador de respuesta siempre se aprueba antes de publicarse.
// Gasto en datos de pago por proyecto (SEO parte 0, 26 nov 2026; migración 0065): tope mensual por proyecto.
export const seoDataSpend = pgTable(
  'seo_data_spend',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 30 }).notNull(),
    operation: varchar('operation', { length: 60 }).notNull(),
    costUsd: decimal('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('seo_data_spend_project_idx').on(table.projectId, table.createdAt)]
);

// Mediciones de velocidad por página (26 nov 2026; migración 0066): datos reales (CrUX) y laboratorio (Lighthouse).
export const seoSpeedChecks = pgTable(
  'seo_speed_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull(),
    url: text('url').notNull(),
    kind: varchar('kind', { length: 12 }).notNull(),
    scope: varchar('scope', { length: 10 }),
    category: varchar('category', { length: 10 }),
    score: integer('score'),
    lcpMs: integer('lcp_ms'),
    inpMs: integer('inp_ms'),
    cls: real('cls'),
    fcpMs: integer('fcp_ms'),
    tbtMs: integer('tbt_ms'),
    siMs: integer('si_ms'),
    data: jsonb('data').notNull().default({}),
    measuredAt: timestamp('measured_at').notNull().defaultNow(),
  },
  (table) => [index('seo_speed_checks_project_idx').on(table.projectId, table.measuredAt), check('seo_speed_checks_kind_check', sql`${table.kind} IN ('campo', 'laboratorio')`)]
);
export type SeoSpeedCheck = typeof seoSpeedChecks.$inferSelect;

// Posiciones (SEO parte 4, 26 nov 2026; migración 0069): búsquedas que se siguen y su posición real cada semana.
export const seoRankKeywords = pgTable(
  'seo_rank_keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 150 }).notNull(),
    keywordKey: varchar('keyword_key', { length: 150 }).notNull(),
    // gsc | servicio_zona | marca | manual
    origin: varchar('origin', { length: 16 }).notNull(),
    language: varchar('language', { length: 5 }).notNull().default('es'),
    device: varchar('device', { length: 8 }).notNull().default('mobile'),
    // activa | pausada | quitada (quitada: no se vuelve a proponer)
    status: varchar('status', { length: 10 }).notNull().default('activa'),
    impressions: integer('impressions'),
    volume: integer('volume'),
    volumeAt: timestamp('volume_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('seo_rank_keywords_unique').on(table.projectId, table.keywordKey, table.device),
    check('seo_rank_keywords_origin_check', sql`${table.origin} IN ('gsc', 'servicio_zona', 'marca', 'manual')`),
    check('seo_rank_keywords_status_check', sql`${table.status} IN ('activa', 'pausada', 'quitada')`),
    check('seo_rank_keywords_device_check', sql`${table.device} IN ('mobile', 'desktop')`),
  ]
);
export type SeoRankKeyword = typeof seoRankKeywords.$inferSelect;

export const seoRankChecks = pgTable(
  'seo_rank_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keywordId: uuid('keyword_id')
      .notNull()
      .references(() => seoRankKeywords.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull(),
    taskId: varchar('task_id', { length: 64 }),
    // pendiente (aún sin enviar) | enviada | hecha | fallida | caducada
    status: varchar('status', { length: 10 }).notNull().default('pendiente'),
    locationName: varchar('location_name', { length: 120 }),
    language: varchar('language', { length: 5 }),
    device: varchar('device', { length: 8 }),
    position: integer('position'),
    url: text('url'),
    clientUrls: text('client_urls').array(),
    localPack: boolean('local_pack'),
    localRank: integer('local_rank'),
    aio: boolean('aio'),
    aioCites: boolean('aio_cites'),
    features: text('features').array(),
    top10: text('top10').array(),
    // URLs del top 10 (0073, parte 7): validar grupos por URL y el tipo de página.
    top10Urls: text('top10_urls').array(),
    costUsd: decimal('cost_usd', { precision: 10, scale: 5 }),
    error: text('error'),
    postedAt: timestamp('posted_at'),
    checkedAt: timestamp('checked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('seo_rank_checks_unique').on(table.keywordId, table.runId),
    index('seo_rank_checks_project_idx').on(table.projectId, table.checkedAt),
    index('seo_rank_checks_open_idx').on(table.status).where(sql`${table.status} IN ('pendiente', 'enviada')`),
    check('seo_rank_checks_status_check', sql`${table.status} IN ('pendiente', 'enviada', 'hecha', 'fallida', 'caducada')`),
  ]
);
export type SeoRankCheck = typeof seoRankChecks.$inferSelect;

// Local (SEO parte 5a, 26 nov 2026; migración 0070): fichas de Google del cliente y de sus competidores, POR CLIENTE, y
// sus fotos periódicas (DataForSEO my_business_info: se pueden guardar; Google Places solo permite guardar el place_id).
export const seoLocalPlaces = pgTable(
  'seo_local_places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // cliente | competidor
    role: varchar('role', { length: 12 }).notNull(),
    clientCompetitorId: uuid('client_competitor_id').references(() => clientCompetitors.id, { onDelete: 'set null' }),
    cid: varchar('cid', { length: 40 }).notNull(),
    placeId: varchar('place_id', { length: 120 }),
    title: varchar('title', { length: 255 }).notNull(),
    // propuesta | confirmada | descartada
    status: varchar('status', { length: 12 }).notNull().default('propuesta'),
    // Lo confirmado (nombre, categoría, teléfono, web, horario): los cambios se comparan con esto, no con la foto anterior.
    baseline: jsonb('baseline').$type<Record<string, unknown>>(),
    decidedBy: varchar('decided_by', { length: 120 }),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('seo_local_places_unique').on(table.clientId, table.cid),
    check('seo_local_places_role_check', sql`${table.role} IN ('cliente', 'competidor')`),
    check('seo_local_places_status_check', sql`${table.status} IN ('propuesta', 'confirmada', 'descartada')`),
  ]
);
export type SeoLocalPlace = typeof seoLocalPlaces.$inferSelect;

export const seoLocalSnapshots = pgTable(
  'seo_local_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    placeRowId: uuid('place_row_id')
      .notNull()
      .references(() => seoLocalPlaces.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    category: varchar('category', { length: 160 }),
    additionalCategories: text('additional_categories').array(),
    phone: varchar('phone', { length: 40 }),
    domain: varchar('domain', { length: 255 }),
    status: varchar('status', { length: 20 }),
    rating: real('rating'),
    votes: integer('votes'),
    distribution: jsonb('distribution'),
    hours: jsonb('hours').$type<Record<string, string>>(),
    isClaimed: boolean('is_claimed'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 5 }),
    takenAt: timestamp('taken_at').notNull().defaultNow(),
  },
  (table) => [index('seo_local_snapshots_place_idx').on(table.placeRowId, table.takenAt)]
);
export type SeoLocalSnapshot = typeof seoLocalSnapshots.$inferSelect;

// Geo-grid (SEO parte 5b, 27 nov 2026; migración 0071): una ejecución por búsqueda y una fila por punto de la cuadrícula.
export const seoGeogridRuns = pgTable(
  'seo_geogrid_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    placeRowId: uuid('place_row_id')
      .notNull()
      .references(() => seoLocalPlaces.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').notNull(),
    keyword: varchar('keyword', { length: 150 }).notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    stepKm: real('step_km').notNull(),
    zoom: integer('zoom').notNull(),
    size: integer('size').notNull().default(5),
    language: varchar('language', { length: 5 }).notNull().default('es'),
    summary: jsonb('summary').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('seo_geogrid_runs_project_idx').on(table.projectId, table.createdAt)]
);
export type SeoGeogridRun = typeof seoGeogridRuns.$inferSelect;

export const seoGeogridPoints = pgTable(
  'seo_geogrid_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => seoGeogridRuns.id, { onDelete: 'cascade' }),
    row: integer('row').notNull(),
    col: integer('col').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    taskId: varchar('task_id', { length: 64 }),
    status: varchar('status', { length: 10 }).notNull().default('pendiente'),
    rank: integer('rank'),
    // Los 20 primeros: { r: puesto, c: cid, t: título, d: dominio, v: nota, n: reseñas, k: categoría }
    results: jsonb('results').$type<{ r: number; c: string | null; t: string; d: string | null; v: number | null; n: number | null; k: string | null }[]>(),
    costUsd: decimal('cost_usd', { precision: 10, scale: 5 }),
    error: text('error'),
    postedAt: timestamp('posted_at'),
    checkedAt: timestamp('checked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('seo_geogrid_points_unique').on(table.runId, table.row, table.col),
    index('seo_geogrid_points_open_idx').on(table.status).where(sql`${table.status} IN ('pendiente', 'enviada')`),
    check('seo_geogrid_points_status_check', sql`${table.status} IN ('pendiente', 'enviada', 'hecha', 'fallida', 'caducada')`),
  ]
);
export type SeoGeogridPoint = typeof seoGeogridPoints.$inferSelect;

// SEO parte 6, tanda 6b (0072): registro de cambios de la web y páginas de dinero (docs/DISENO-SEO-TECNICO-2BC.md).
/** Foto estructurada de una página (vigilancia de dinero). */
export type MoneySnap = { status: number; title: string | null; h1: string | null; canonical: string | null; indexable: boolean; words: number; simhash: string | null; at: string };
export const seoChangeLog = pgTable(
  'seo_change_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    urlHash: varchar('url_hash', { length: 40 }).notNull(),
    // title | meta_description | h1 | canonical | indexable | status | content | schema | url_new | url_gone | host | tech
    field: varchar('field', { length: 30 }).notNull(),
    before: text('before'),
    after: text('after'),
    extra: jsonb('extra').$type<Record<string, unknown>>(),
    // rastreo | dinero
    source: varchar('source', { length: 10 }).notNull(),
    // id del rastreo o «dinero:<id del trabajo>»: un reintento no duplica.
    batch: varchar('batch', { length: 64 }).notNull(),
    prevObservedAt: timestamp('prev_observed_at'),
    detectedAt: timestamp('detected_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('seo_change_log_unique').on(table.projectId, table.batch, table.urlHash, table.field),
    index('seo_change_log_project_idx').on(table.projectId, table.detectedAt.desc()),
    index('seo_change_log_url_idx').on(table.projectId, table.urlHash, table.detectedAt),
    check('seo_change_log_source_check', sql`${table.source} IN ('rastreo', 'dinero')`),
  ]
);
export type SeoChangeLog = typeof seoChangeLog.$inferSelect;

export const seoMoneyPages = pgTable(
  'seo_money_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    urlHash: varchar('url_hash', { length: 40 }).notNull(),
    // home | top | pinned | encargo (varios a la vez)
    reasons: text('reasons').array().notNull().default(sql`'{}'::text[]`),
    expiresAt: timestamp('expires_at'),
    outSince: timestamp('out_since'),
    active: boolean('active').notNull().default(true),
    baseline: jsonb('baseline').$type<MoneySnap>(),
    baselineVersion: integer('baseline_version').notNull().default(1),
    last: jsonb('last').$type<MoneySnap>(),
    stable: jsonb('stable').$type<MoneySnap>(),
    lastCheckedAt: timestamp('last_checked_at'),
    pendingKind: varchar('pending_kind', { length: 40 }),
    pendingSince: timestamp('pending_since'),
    failStreak: integer('fail_streak').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('seo_money_pages_unique').on(table.projectId, table.urlHash), index('seo_money_pages_active_idx').on(table.projectId, table.active)]
);
export type SeoMoneyPage = typeof seoMoneyPages.$inferSelect;

// SEO parte 7 (0073): demanda por búsqueda (volumen, intención por la SERP, ideas y su estado). docs/DISENO-SEO-DEMANDA.md.
export const seoDemand = pgTable(
  'seo_demand',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 200 }).notNull(),
    keywordKey: varchar('keyword_key', { length: 200 }).notNull(),
    language: varchar('language', { length: 5 }).notNull().default('es'),
    volume: integer('volume'),
    cpc: real('cpc'),
    competition: varchar('competition', { length: 10 }),
    monthly: jsonb('monthly').$type<{ month: string; volume: number }[]>(),
    volumeAt: timestamp('volume_at'),
    // mapa (búsqueda principal de un tema) | idea (ideas de palabras)
    origin: varchar('origin', { length: 10 }).notNull(),
    // auto | nueva | seguida | descartada
    status: varchar('status', { length: 12 }).notNull().default('auto'),
    seed: varchar('seed', { length: 200 }),
    topicKey: varchar('topic_key', { length: 80 }),
    rankKeywordId: uuid('rank_keyword_id').references(() => seoRankKeywords.id, { onDelete: 'set null' }),
    // local | transaccional | informacional | mixta
    intent: varchar('intent', { length: 15 }),
    // servicio | articulo | directorio | mixto
    pageType: varchar('page_type', { length: 15 }),
    top10Urls: text('top10_urls').array(),
    serpAt: timestamp('serp_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('seo_demand_unique').on(table.projectId, table.keywordKey, table.language),
    index('seo_demand_project_idx').on(table.projectId, table.origin, table.status),
    check('seo_demand_origin_check', sql`${table.origin} IN ('mapa', 'idea')`),
    check('seo_demand_status_check', sql`${table.status} IN ('auto', 'nueva', 'seguida', 'descartada')`),
  ]
);
export type SeoDemand = typeof seoDemand.$inferSelect;

// SEO parte 9a (0074): briefs de contenido con la SERP real (docs/DISENO-SEO-CONTENIDO.md).
export const seoBriefs = pgTable(
  'seo_briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 200 }).notNull(),
    topicKey: varchar('topic_key', { length: 80 }),
    targetUrl: text('target_url'),
    // preparando | borrador | listo | usado | fallido | archivado
    status: varchar('status', { length: 12 }).notNull().default('preparando'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    publishedUrl: text('published_url'),
    error: text('error'),
    createdBy: varchar('created_by', { length: 120 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('seo_briefs_project_idx').on(table.projectId, table.status, table.createdAt),
    check('seo_briefs_status_check', sql`${table.status} IN ('preparando', 'borrador', 'listo', 'usado', 'fallido', 'archivado')`),
  ]
);
export type SeoBrief = typeof seoBriefs.$inferSelect;

export const seoReviews = pgTable(
  'seo_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    clientAssetId: uuid('client_asset_id')
      .notNull()
      .references(() => clientAssets.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 300 }).notNull(),
    author: varchar('author', { length: 200 }),
    rating: smallint('rating'),
    text: text('text'),
    publishedAt: timestamp('published_at'),
    replyText: text('reply_text'),
    replyAt: timestamp('reply_at'),
    draft: text('draft'),
    // sin_borrador | pendiente | aprobado | publicado | descartado
    draftStatus: varchar('draft_status', { length: 12 }).notNull().default('sin_borrador'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('seo_reviews_unique').on(table.clientAssetId, table.externalId),
    index('seo_reviews_client_idx').on(table.clientId, table.publishedAt),
    check('seo_reviews_draft_check', sql`${table.draftStatus} IN ('sin_borrador', 'pendiente', 'aprobado', 'publicado', 'descartado')`),
    check('seo_reviews_rating_check', sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`),
  ]
);
export type SeoReview = typeof seoReviews.$inferSelect;

// =====================================================================================================================
// HITO 2 SEO (24 nov 2026, migración 0062; docs/DISENO-TECNICO-HITO2.md, aprobado por Enric): mapa de palabras.
// =====================================================================================================================

// Un tema del mapa de palabras de un proyecto: consultas que Google trata como lo mismo (comparten página) o que se
// parecen, con su URL (o null = hace falta una página nueva) y sus cifras de los últimos 90 días.
export const seoTopics = pgTable(
  'seo_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Identifica el mismo tema entre ejecuciones (hash de sus consultas principales o de su URL).
    topicKey: varchar('topic_key', { length: 80 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    // null = página nueva (nadie de la web lo cubre todavía)
    url: text('url'),
    // pagina (comparten URL en Search Console) | parecido (texto) | competencia (huecos)
    origin: varchar('origin', { length: 12 }).notNull(),
    // { clics, impresiones, posicion, ctr, tendenciaPct, volumen, consultas }
    metrics: jsonb('metrics').$type<Record<string, number | null>>().notNull().default({}),
    // activo | descartado
    status: varchar('status', { length: 12 }).notNull().default('activo'),
    namedBy: varchar('named_by', { length: 10 }).notNull().default('reglas'),
    runAt: timestamp('run_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('seo_topics_key_unique').on(table.projectId, table.topicKey),
    index('seo_topics_project_idx').on(table.projectId, table.status),
    check('seo_topics_origin_check', sql`${table.origin} IN ('pagina', 'parecido', 'competencia')`),
    check('seo_topics_status_check', sql`${table.status} IN ('activo', 'descartado')`),
    check('seo_topics_named_check', sql`${table.namedBy} IN ('reglas', 'ia', 'persona')`),
  ]
);
export type SeoTopic = typeof seoTopics.$inferSelect;

export const seoTopicQueries = pgTable(
  'seo_topic_queries',
  {
    topicId: uuid('topic_id')
      .notNull()
      .references(() => seoTopics.id, { onDelete: 'cascade' }),
    queryHash: varchar('query_hash', { length: 40 }).notNull(),
    query: text('query').notNull(),
    // gsc | competencia | manual
    source: varchar('source', { length: 12 }).notNull().default('gsc'),
    clicks: integer('clicks').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    position: doublePrecision('position'),
    volume: integer('volume'),
  },
  (table) => [
    primaryKey({ name: 'seo_topic_queries_pk', columns: [table.topicId, table.queryHash] }),
    check('seo_topic_queries_source_check', sql`${table.source} IN ('gsc', 'competencia', 'manual')`),
  ]
);

// Embeddings de textos cortos (consultas), guardados por texto y modelo: una consulta repetida entre proyectos o
// ejecuciones no se vuelve a pagar. Sin tenant: el vector de un texto público es el mismo para todos.
export const seoTextEmbeddings = pgTable(
  'seo_text_embeddings',
  {
    textHash: varchar('text_hash', { length: 40 }).notNull(),
    model: varchar('model', { length: 80 }).notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ name: 'seo_text_embeddings_pk', columns: [table.textHash, table.model] })]
);
