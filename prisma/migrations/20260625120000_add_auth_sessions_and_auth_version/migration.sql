-- Phase 31B: Add auth_sessions model, restructure refresh_tokens
-- Data-preservation: existing refresh_tokens rows are migrated, not dropped.
-- Rollback: drop new columns/tables in reverse order, restore user_id column.

-- Step 1: Add auth_version to users
ALTER TABLE "users" ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Create auth_sessions table
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");
CREATE INDEX "auth_sessions_revoked_at_idx" ON "auth_sessions"("revoked_at");
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Add new columns to refresh_tokens (nullable initially)
ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "used_at" TIMESTAMP(3);

-- Step 4: Backfill — create one AuthSession per existing refresh_token
INSERT INTO "auth_sessions" ("id", "user_id", "created_at")
SELECT
    "id",
    "user_id",
    "created_at"
FROM "refresh_tokens"
WHERE "user_id" IS NOT NULL;

-- Step 5: Backfill session_id using the token's own id as its session id
UPDATE "refresh_tokens" SET "session_id" = "id" WHERE "session_id" IS NULL;

-- Step 6: Mark any revoked tokens as used (they have no further use)
UPDATE "refresh_tokens" SET "used_at" = "revoked_at" WHERE "revoked_at" IS NOT NULL AND "used_at" IS NULL;

-- Step 7: Make session_id NOT NULL now that all rows are backfilled
ALTER TABLE "refresh_tokens" ALTER COLUMN "session_id" SET NOT NULL;

-- Step 8: Add FK and indexes on refresh_tokens
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- Step 9: Drop legacy user_id column (data preserved in auth_sessions)
ALTER TABLE "refresh_tokens" DROP COLUMN "user_id";

-- Step 10: Ensure unique index on token_hash exists
-- (it already exists from init migration, this is idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
