-- Institutional RBAC 2: three-role model scoping, beneficiary claim codes,
-- and mandatory programme dates.
-- Data-preservation: purely additive/backfilled. No table or column is
-- dropped. Existing rows are backfilled with safe, non-destructive defaults
-- before any column is tightened to NOT NULL.
-- Rollback: relax payment_operations/social_programs NOT NULL constraints
-- back to nullable, drop the operator_id column and its FK on users, drop
-- the claim_code column on payments, drop user_programme_scopes.

-- Step 1: User -> Operator scope (nullable; only OPERATOR-role users get one)
ALTER TABLE "users" ADD COLUMN "operator_id" TEXT;

CREATE INDEX "users_operator_id_idx" ON "users"("operator_id");

ALTER TABLE "users" ADD CONSTRAINT "users_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 2: User <-> SocialProgram scope (many-to-many, PROGRAMME role)
CREATE TABLE "user_programme_scopes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "social_program_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_programme_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_programme_scopes_user_id_social_program_id_key"
    ON "user_programme_scopes"("user_id", "social_program_id");
CREATE INDEX "user_programme_scopes_social_program_id_idx"
    ON "user_programme_scopes"("social_program_id");

ALTER TABLE "user_programme_scopes" ADD CONSTRAINT "user_programme_scopes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_programme_scopes" ADD CONSTRAINT "user_programme_scopes_social_program_id_fkey"
    FOREIGN KEY ("social_program_id") REFERENCES "social_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Beneficiary claim code on payments (nullable; unique when present)
ALTER TABLE "payments" ADD COLUMN "claim_code" TEXT;

CREATE UNIQUE INDEX "payments_claim_code_key" ON "payments"("claim_code");

-- Step 4: Programme dates become mandatory going forward.
-- Backfill existing rows with a safe, non-destructive default before adding
-- the NOT NULL constraint: start_date defaults to the row's created_at date,
-- end_date defaults to one year after start_date. This is local/test/demo
-- data only (no production database is touched by this migration file
-- itself; applying it to any real environment is a separate, explicit step).
UPDATE "social_programs"
SET "start_date" = "created_at"
WHERE "start_date" IS NULL;

UPDATE "social_programs"
SET "end_date" = "start_date" + INTERVAL '1 year'
WHERE "end_date" IS NULL;

ALTER TABLE "social_programs" ALTER COLUMN "start_date" SET NOT NULL;
ALTER TABLE "social_programs" ALTER COLUMN "end_date" SET NOT NULL;
