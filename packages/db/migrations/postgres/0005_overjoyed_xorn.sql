CREATE TABLE "quality_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"suite_name" text NOT NULL,
	"environment" text NOT NULL,
	"minimum_case_count" integer DEFAULT 1 NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quality_gates" ADD CONSTRAINT "quality_gates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quality_gates_project_name_idx" ON "quality_gates" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "quality_gates_project_suite_idx" ON "quality_gates" USING btree ("project_id","suite_name","environment");