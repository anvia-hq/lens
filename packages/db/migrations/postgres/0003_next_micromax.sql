CREATE TYPE "public"."cost_recalculation_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "cost_recalculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" "cost_recalculation_status" DEFAULT 'queued' NOT NULL,
	"from" timestamp with time zone,
	"to" timestamp with time zone,
	"price_snapshot" jsonb NOT NULL,
	"affected_spans" text,
	"affected_traces" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "llm_model_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"model" text NOT NULL,
	"input_price_per_million" numeric(24, 12) NOT NULL,
	"cached_input_price_per_million" numeric(24, 12),
	"output_price_per_million" numeric(24, 12) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_recalculations" ADD CONSTRAINT "cost_recalculations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_recalculations" ADD CONSTRAINT "cost_recalculations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_model_prices" ADD CONSTRAINT "llm_model_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_recalculations_org_created_idx" ON "cost_recalculations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_model_prices_org_model_idx" ON "llm_model_prices" USING btree ("organization_id","model");--> statement-breakpoint
CREATE INDEX "llm_model_prices_org_idx" ON "llm_model_prices" USING btree ("organization_id");