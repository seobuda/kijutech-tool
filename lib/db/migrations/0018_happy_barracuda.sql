ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_provider" varchar(20);--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_model" varchar(100);