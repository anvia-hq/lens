CREATE TYPE "public"."alert_incident_status" AS ENUM('open', 'acknowledged', 'resolved');--> statement-breakpoint
CREATE TABLE "alert_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"rule_id" uuid,
	"rule_name" text NOT NULL,
	"kind" text NOT NULL,
	"subject_key" text NOT NULL,
	"status" "alert_incident_status" DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"observed_value" numeric(24, 8),
	"threshold" numeric(24, 8),
	"sample_count" integer,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"threshold" numeric(24, 8),
	"window_minutes" integer,
	"minimum_samples" integer,
	"environment" text,
	"service_name" text,
	"tool_name" text,
	"quality_gate_id" uuid,
	"consecutive_breaches" integer DEFAULT 0 NOT NULL,
	"last_evaluated_at" timestamp with time zone,
	"cooldown_until" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_incidents" ADD CONSTRAINT "alert_incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_incidents" ADD CONSTRAINT "alert_incidents_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_incidents" ADD CONSTRAINT "alert_incidents_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_incidents" ADD CONSTRAINT "alert_incidents_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_quality_gate_id_quality_gates_id_fk" FOREIGN KEY ("quality_gate_id") REFERENCES "public"."quality_gates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_incidents_active_subject_idx" ON "alert_incidents" USING btree ("rule_id","subject_key") WHERE "alert_incidents"."status" in ('open', 'acknowledged') and "alert_incidents"."rule_id" is not null;--> statement-breakpoint
CREATE INDEX "alert_incidents_project_status_idx" ON "alert_incidents" USING btree ("project_id","status","last_triggered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_rules_project_name_idx" ON "alert_rules" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE INDEX "alert_rules_project_enabled_idx" ON "alert_rules" USING btree ("project_id","enabled");--> statement-breakpoint
CREATE INDEX "alert_rules_gate_idx" ON "alert_rules" USING btree ("quality_gate_id");