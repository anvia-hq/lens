ALTER TABLE "mcp_tokens" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "mcp_tokens" SET "organization_id" = sub."organization_id" FROM (
  SELECT DISTINCT ON (m."user_id") m."user_id", m."organization_id"
  FROM "members" m
  ORDER BY m."user_id", m."created_at" ASC
) AS sub WHERE "mcp_tokens"."created_by" = sub."user_id" AND "mcp_tokens"."organization_id" IS NULL;--> statement-breakpoint
UPDATE "mcp_tokens" SET "revoked_at" = COALESCE("mcp_tokens"."revoked_at", now()) WHERE "mcp_tokens"."organization_id" IS NULL;--> statement-breakpoint
DELETE FROM "mcp_tokens" WHERE "mcp_tokens"."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_tokens_org_idx" ON "mcp_tokens" USING btree ("organization_id");