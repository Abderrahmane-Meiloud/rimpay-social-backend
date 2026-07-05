-- Institutional RBAC 2 FIX: structural web/field role boundary.
-- Purely additive: new column with a safe default, immediately backfilled
-- to correctly mark AGENT as a non-web (field/device) role. No table or
-- column is dropped, no existing row is invalidated.
-- Rollback: drop the is_web_role column.

ALTER TABLE "roles" ADD COLUMN "is_web_role" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: any existing AGENT role row (from before this migration) is a
-- field/device technical role, never a web platform role.
UPDATE "roles" SET "is_web_role" = false WHERE "name" = 'AGENT';
