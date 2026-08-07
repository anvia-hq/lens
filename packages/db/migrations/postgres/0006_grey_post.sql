CREATE TYPE "public"."managed_dataset_version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "managed_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_dataset_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"position" integer NOT NULL,
	"item" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" "managed_dataset_version_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "managed_datasets" ADD CONSTRAINT "managed_datasets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_datasets" ADD CONSTRAINT "managed_datasets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_dataset_cases" ADD CONSTRAINT "managed_dataset_cases_version_id_managed_dataset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."managed_dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_dataset_versions" ADD CONSTRAINT "managed_dataset_versions_dataset_id_managed_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."managed_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_dataset_versions" ADD CONSTRAINT "managed_dataset_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "managed_datasets_project_name_idx" ON "managed_datasets" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE INDEX "managed_datasets_project_updated_idx" ON "managed_datasets" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_dataset_cases_version_case_idx" ON "managed_dataset_cases" USING btree ("version_id",lower("case_id"));--> statement-breakpoint
CREATE INDEX "managed_dataset_cases_version_position_idx" ON "managed_dataset_cases" USING btree ("version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_dataset_versions_label_idx" ON "managed_dataset_versions" USING btree ("dataset_id",lower("version"));--> statement-breakpoint
CREATE UNIQUE INDEX "managed_dataset_versions_single_draft_idx" ON "managed_dataset_versions" USING btree ("dataset_id") WHERE "managed_dataset_versions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "managed_dataset_versions_dataset_created_idx" ON "managed_dataset_versions" USING btree ("dataset_id","created_at");