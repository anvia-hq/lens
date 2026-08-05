CREATE TYPE "public"."project_state" AS ENUM('active', 'deleting');

CREATE TABLE "users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "active_organization_id" text
);
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");
CREATE TABLE "accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "password" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "accounts_user_idx" ON "accounts" ("user_id");
CREATE TABLE "verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");
CREATE TABLE "organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "logo" text,
  "metadata" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "members" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "members_org_user_idx" ON "members" ("organization_id", "user_id");
CREATE INDEX "members_user_idx" ON "members" ("user_id");
CREATE TABLE "invitations" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "role" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "inviter_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "invitations_org_idx" ON "invitations" ("organization_id");
CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "state" "project_state" DEFAULT 'active' NOT NULL,
  "retention_days" text DEFAULT '30' NOT NULL,
  "redaction_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "projects_org_slug_idx" ON "projects" ("organization_id", "slug");
CREATE INDEX "projects_org_idx" ON "projects" ("organization_id");
CREATE TABLE "project_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "prefix" text NOT NULL UNIQUE,
  "secret_hash" text NOT NULL,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz
);
CREATE INDEX "project_api_keys_project_idx" ON "project_api_keys" ("project_id");
