CREATE TABLE IF NOT EXISTS "auth_login_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "ip" varchar(64),
  "succeeded" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_login_attempts_email_created_idx" ON "auth_login_attempts" USING btree ("email","created_at");
