ALTER TABLE "seo_knowledge_cards" ADD COLUMN "context_key" varchar(100);--> statement-breakpoint
ALTER TABLE "seo_onboarding_checklist" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;