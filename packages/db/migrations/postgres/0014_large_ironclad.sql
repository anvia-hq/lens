UPDATE "project_mcp_tokens" SET "revoked_at" = now() WHERE "revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "project_mcp_tokens" RENAME TO "mcp_tokens";--> statement-breakpoint
ALTER TABLE "mcp_tokens" RENAME CONSTRAINT "project_mcp_tokens_token_hash_unique" TO "mcp_tokens_token_hash_unique";--> statement-breakpoint
ALTER TABLE "mcp_tokens" RENAME CONSTRAINT "project_mcp_tokens_created_by_users_id_fk" TO "mcp_tokens_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "mcp_tokens" DROP COLUMN "project_id";
