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
  vector,
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
});

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
});

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
      sql`${table.kind} IN ('new_request', 'daily_summary', 'test', 'review_request', 'block_alert', 'reply', 'returned', 'digest', 'reminder')`
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
  },
  (table) => [unique('ops_work_types_tenant_key_unique').on(table.tenantId, table.key)]
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
    check('ops_outbox_action_check', sql`${table.action} IN ('set_status', 'comment')`),
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
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('ops_team_profiles_tenant_clickup_unique').on(table.tenantId, table.clickupUserId)]
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

export type OpsClientTool = { name: string; url: string; note: string };

export const opsClients = pgTable(
  'ops_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
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
    // Webs y herramientas. NUNCA contraseñas.
    tools: jsonb('tools').$type<OpsClientTool[]>().notNull().default([]),
    business: text('business'),
    offerings: text('offerings'),
    area: varchar('area', { length: 255 }),
    audience: text('audience'),
    goals: text('goals'),
    strategy: text('strategy'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
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
      .references(() => opsClients.id, { onDelete: 'cascade' }),
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
      .references(() => opsClients.id, { onDelete: 'cascade' }),
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

export type OpsClientActivity = typeof opsClientActivity.$inferSelect;
export type OpsClient = typeof opsClients.$inferSelect;
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
