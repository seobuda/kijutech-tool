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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
