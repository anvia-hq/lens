DROP INDEX IF EXISTS "members_user_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_idx" ON "members" USING btree ("user_id");
