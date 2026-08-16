import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: varchar('plan', { length: 20 }).notNull().default('internal'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
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
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
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
  },
  (table) => [unique().on(table.projectId, table.itemKey)]
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
