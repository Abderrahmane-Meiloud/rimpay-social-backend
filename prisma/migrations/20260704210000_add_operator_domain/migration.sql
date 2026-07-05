-- Institutional RBAC 1: Introduce the Operator domain layer.
-- Data-preservation: purely additive. No table is dropped, no column is
-- dropped, and no existing row is altered. New foreign keys are added as
-- NULLABLE so every existing Agent and PaymentOperation row remains valid
-- with operator_id = NULL.
-- Rollback: drop the two new foreign key constraints and columns, then drop
-- the operators table and the operator_status enum, in this order.

-- Step 1: Create operator_status enum
CREATE TYPE "operator_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- Step 2: Create operators table
CREATE TABLE "operators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT,
    "legal_name" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "status" "operator_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operators_code_key" ON "operators"("code");
CREATE INDEX "operators_status_idx" ON "operators"("status");

-- Step 3: Add nullable operator_id to agents (existing agents remain valid)
ALTER TABLE "agents" ADD COLUMN "operator_id" TEXT;

CREATE INDEX "agents_operator_id_idx" ON "agents"("operator_id");

ALTER TABLE "agents" ADD CONSTRAINT "agents_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Add nullable operator_id to payment_operations (existing operations remain valid)
ALTER TABLE "payment_operations" ADD COLUMN "operator_id" TEXT;

CREATE INDEX "payment_operations_operator_id_idx" ON "payment_operations"("operator_id");

ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
