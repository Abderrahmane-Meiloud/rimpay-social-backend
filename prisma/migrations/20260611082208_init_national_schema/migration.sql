-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "agent_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "device_status" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "social_program_status" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "operation_status" AS ENUM ('DRAFT', 'VALIDATED', 'OPEN', 'IN_PROGRESS', 'SUSPENDED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "inclusion_status" AS ENUM ('INCLUDED', 'EXCLUDED', 'PENDING_REVIEW', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'VALIDATED', 'PAID', 'CANCELLED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "validation_outcome" AS ENUM ('ATTEMPTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "auth_method" AS ENUM ('CNI', 'MRZ', 'QR_CODE', 'PHONE_CALL', 'COMMUNITY_WITNESS', 'BENEFICIARY_CARD', 'MANUAL_EXCEPTION');

-- CreateEnum
CREATE TYPE "recipient_type" AS ENUM ('BENEFICIARY', 'REPRESENTATIVE', 'COMMUNITY_WITNESS', 'OTHER');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('NOT_SYNCED', 'SYNCED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "sync_batch_status" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED');

-- CreateEnum
CREATE TYPE "sync_item_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "anomaly_type" AS ENUM ('DUPLICATE_NNI', 'DUPLICATE_PHONE', 'MULTIPLE_PAYMENT', 'PAYMENT_ALREADY_VALIDATED', 'MISSING_GPS', 'GPS_OUT_OF_ZONE', 'SYNC_CONFLICT', 'UNKNOWN_DEVICE', 'AGENT_NOT_ASSIGNED', 'BENEFICIARY_MODIFIED_AFTER_PAYMENT');

-- CreateEnum
CREATE TYPE "anomaly_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "anomaly_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "audit_source" AS ENUM ('WEB', 'MOBILE', 'API', 'SYSTEM');

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('BENEFICIARIES', 'PAYMENT_OPERATION', 'PAYMENTS', 'ANOMALIES', 'AGENTS', 'AUDIT', 'SYNC');

-- CreateEnum
CREATE TYPE "report_format" AS ENUM ('PDF', 'EXCEL', 'CSV', 'JSON');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "geo_assignment_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('CNI', 'QR_CARD', 'BENEFICIARY_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "contact_type" AS ENUM ('PRIMARY', 'SECONDARY', 'OTHER');

-- CreateEnum
CREATE TYPE "beneficiary_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'DECEASED', 'MOVED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "operation_agent_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'COMPLETED', 'REMOVED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moughataas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moughataas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "moughataa_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "commune_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" TEXT NOT NULL,
    "registry_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "nni" TEXT,
    "gender" TEXT,
    "birth_date" TIMESTAMP(3),
    "locality_id" TEXT NOT NULL,
    "status" "beneficiary_status" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiary_contacts" (
    "id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "type" "contact_type" NOT NULL DEFAULT 'PRIMARY',
    "phone" TEXT NOT NULL,
    "owner_name" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiary_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiary_documents" (
    "id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "type" "document_type" NOT NULL,
    "file_reference" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiary_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiary_histories" (
    "id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "changed_by_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiary_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT,
    "institution" TEXT,
    "description" TEXT,
    "status" "social_program_status" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "budget_amount" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "social_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_operations" (
    "id" TEXT NOT NULL,
    "social_program_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "period" TEXT,
    "region_id" TEXT,
    "moughataa_id" TEXT,
    "commune_id" TEXT,
    "locality_id" TEXT,
    "planned_amount" DECIMAL(18,2),
    "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "execution_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "operation_status" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_operation_beneficiaries" (
    "id" TEXT NOT NULL,
    "payment_operation_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "planned_amount" DECIMAL(18,2),
    "status" "inclusion_status" NOT NULL DEFAULT 'PENDING_REVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_operation_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_agents" (
    "id" TEXT NOT NULL,
    "payment_operation_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "assigned_area" TEXT,
    "status" "operation_agent_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operation_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT,
    "employee_code" TEXT,
    "status" "agent_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_geographic_assignments" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "region_id" TEXT,
    "moughataa_id" TEXT,
    "commune_id" TEXT,
    "locality_id" TEXT,
    "status" "geo_assignment_status" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_geographic_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "device_uid" TEXT NOT NULL,
    "platform" TEXT,
    "model" TEXT,
    "app_version" TEXT,
    "status" "device_status" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "payment_operation_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "sync_status" "sync_status" NOT NULL DEFAULT 'NOT_SYNCED',
    "planned_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_validations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "outcome" "validation_outcome" NOT NULL DEFAULT 'ATTEMPTED',
    "auth_method" "auth_method" NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "recipient_type" "recipient_type",
    "recipient_name" TEXT,
    "sync_batch_id" TEXT,
    "idempotency_key" TEXT,
    "validated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_status_history" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "from_status" "payment_status",
    "to_status" "payment_status" NOT NULL,
    "changed_by" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_batches" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "batch_uid" TEXT NOT NULL,
    "status" "sync_batch_status" NOT NULL DEFAULT 'RECEIVED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "accepted_items" INTEGER NOT NULL DEFAULT 0,
    "rejected_items" INTEGER NOT NULL DEFAULT 0,
    "conflict_items" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_items" (
    "id" TEXT NOT NULL,
    "sync_batch_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "local_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "sync_item_status" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "linked_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "source" "audit_source" NOT NULL DEFAULT 'SYSTEM',
    "ip_address" TEXT,
    "device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" TEXT NOT NULL,
    "type" "anomaly_type" NOT NULL,
    "severity" "anomaly_severity" NOT NULL DEFAULT 'MEDIUM',
    "status" "anomaly_status" NOT NULL DEFAULT 'OPEN',
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "beneficiary_id" TEXT,
    "payment_id" TEXT,
    "payment_operation_id" TEXT,
    "agent_id" TEXT,
    "device_id" TEXT,
    "sync_batch_id" TEXT,
    "sync_item_id" TEXT,
    "description" TEXT,
    "resolution_notes" TEXT,
    "resolved_by" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "report_type" "report_type" NOT NULL,
    "generated_by" TEXT,
    "filters" JSONB,
    "file_path" TEXT,
    "format" "report_format" NOT NULL DEFAULT 'PDF',
    "status" "report_status" NOT NULL DEFAULT 'PENDING',
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "moughataas_code_key" ON "moughataas"("code");

-- CreateIndex
CREATE INDEX "moughataas_region_id_idx" ON "moughataas"("region_id");

-- CreateIndex
CREATE UNIQUE INDEX "communes_code_key" ON "communes"("code");

-- CreateIndex
CREATE INDEX "communes_moughataa_id_idx" ON "communes"("moughataa_id");

-- CreateIndex
CREATE UNIQUE INDEX "localities_code_key" ON "localities"("code");

-- CreateIndex
CREATE INDEX "localities_commune_id_idx" ON "localities"("commune_id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiaries_registry_code_key" ON "beneficiaries"("registry_code");

-- CreateIndex
CREATE INDEX "beneficiaries_nni_idx" ON "beneficiaries"("nni");

-- CreateIndex
CREATE INDEX "beneficiaries_full_name_idx" ON "beneficiaries"("full_name");

-- CreateIndex
CREATE INDEX "beneficiaries_locality_id_idx" ON "beneficiaries"("locality_id");

-- CreateIndex
CREATE INDEX "beneficiaries_status_idx" ON "beneficiaries"("status");

-- CreateIndex
CREATE INDEX "beneficiary_contacts_beneficiary_id_idx" ON "beneficiary_contacts"("beneficiary_id");

-- CreateIndex
CREATE INDEX "beneficiary_contacts_phone_idx" ON "beneficiary_contacts"("phone");

-- CreateIndex
CREATE INDEX "beneficiary_documents_beneficiary_id_idx" ON "beneficiary_documents"("beneficiary_id");

-- CreateIndex
CREATE INDEX "beneficiary_histories_beneficiary_id_idx" ON "beneficiary_histories"("beneficiary_id");

-- CreateIndex
CREATE INDEX "beneficiary_histories_created_at_idx" ON "beneficiary_histories"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_programs_code_key" ON "social_programs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_operations_code_key" ON "payment_operations"("code");

-- CreateIndex
CREATE INDEX "payment_operations_status_idx" ON "payment_operations"("status");

-- CreateIndex
CREATE INDEX "payment_operations_social_program_id_idx" ON "payment_operations"("social_program_id");

-- CreateIndex
CREATE INDEX "payment_operations_region_id_idx" ON "payment_operations"("region_id");

-- CreateIndex
CREATE INDEX "payment_operations_moughataa_id_idx" ON "payment_operations"("moughataa_id");

-- CreateIndex
CREATE INDEX "payment_operations_commune_id_idx" ON "payment_operations"("commune_id");

-- CreateIndex
CREATE INDEX "payment_operations_locality_id_idx" ON "payment_operations"("locality_id");

-- CreateIndex
CREATE INDEX "payment_operations_start_date_idx" ON "payment_operations"("start_date");

-- CreateIndex
CREATE INDEX "payment_operations_end_date_idx" ON "payment_operations"("end_date");

-- CreateIndex
CREATE INDEX "payment_operation_beneficiaries_beneficiary_id_idx" ON "payment_operation_beneficiaries"("beneficiary_id");

-- CreateIndex
CREATE INDEX "payment_operation_beneficiaries_status_idx" ON "payment_operation_beneficiaries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_operation_beneficiaries_payment_operation_id_benefi_key" ON "payment_operation_beneficiaries"("payment_operation_id", "beneficiary_id");

-- CreateIndex
CREATE INDEX "operation_agents_agent_id_idx" ON "operation_agents"("agent_id");

-- CreateIndex
CREATE INDEX "operation_agents_status_idx" ON "operation_agents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "operation_agents_payment_operation_id_agent_id_key" ON "operation_agents"("payment_operation_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_user_id_key" ON "agents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_employee_code_key" ON "agents"("employee_code");

-- CreateIndex
CREATE INDEX "agent_geographic_assignments_agent_id_idx" ON "agent_geographic_assignments"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_uid_key" ON "devices"("device_uid");

-- CreateIndex
CREATE INDEX "devices_agent_id_idx" ON "devices"("agent_id");

-- CreateIndex
CREATE INDEX "payments_payment_operation_id_idx" ON "payments"("payment_operation_id");

-- CreateIndex
CREATE INDEX "payments_beneficiary_id_idx" ON "payments"("beneficiary_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_sync_status_idx" ON "payments"("sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_operation_id_beneficiary_id_key" ON "payments"("payment_operation_id", "beneficiary_id");

-- CreateIndex
CREATE INDEX "payment_validations_payment_id_idx" ON "payment_validations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_validations_agent_id_idx" ON "payment_validations"("agent_id");

-- CreateIndex
CREATE INDEX "payment_validations_device_id_idx" ON "payment_validations"("device_id");

-- CreateIndex
CREATE INDEX "payment_validations_outcome_idx" ON "payment_validations"("outcome");

-- CreateIndex
CREATE INDEX "payment_validations_auth_method_idx" ON "payment_validations"("auth_method");

-- CreateIndex
CREATE INDEX "payment_validations_validated_at_idx" ON "payment_validations"("validated_at");

-- CreateIndex
CREATE INDEX "payment_validations_sync_batch_id_idx" ON "payment_validations"("sync_batch_id");

-- CreateIndex
CREATE INDEX "payment_validations_idempotency_key_idx" ON "payment_validations"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_status_history_payment_id_idx" ON "payment_status_history"("payment_id");

-- CreateIndex
CREATE INDEX "payment_status_history_changed_by_idx" ON "payment_status_history"("changed_by");

-- CreateIndex
CREATE INDEX "payment_status_history_created_at_idx" ON "payment_status_history"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_batches_batch_uid_key" ON "sync_batches"("batch_uid");

-- CreateIndex
CREATE INDEX "sync_batches_agent_id_idx" ON "sync_batches"("agent_id");

-- CreateIndex
CREATE INDEX "sync_batches_device_id_idx" ON "sync_batches"("device_id");

-- CreateIndex
CREATE INDEX "sync_items_idempotency_key_idx" ON "sync_items"("idempotency_key");

-- CreateIndex
CREATE INDEX "sync_items_status_idx" ON "sync_items"("status");

-- CreateIndex
CREATE INDEX "sync_items_sync_batch_id_idx" ON "sync_items"("sync_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_items_device_id_local_id_item_type_key" ON "sync_items"("device_id", "local_id", "item_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "anomalies_status_idx" ON "anomalies"("status");

-- CreateIndex
CREATE INDEX "anomalies_severity_idx" ON "anomalies"("severity");

-- CreateIndex
CREATE INDEX "anomalies_type_idx" ON "anomalies"("type");

-- CreateIndex
CREATE INDEX "anomalies_beneficiary_id_idx" ON "anomalies"("beneficiary_id");

-- CreateIndex
CREATE INDEX "anomalies_payment_id_idx" ON "anomalies"("payment_id");

-- CreateIndex
CREATE INDEX "anomalies_payment_operation_id_idx" ON "anomalies"("payment_operation_id");

-- CreateIndex
CREATE INDEX "anomalies_agent_id_idx" ON "anomalies"("agent_id");

-- CreateIndex
CREATE INDEX "anomalies_device_id_idx" ON "anomalies"("device_id");

-- CreateIndex
CREATE INDEX "anomalies_sync_batch_id_idx" ON "anomalies"("sync_batch_id");

-- CreateIndex
CREATE INDEX "anomalies_sync_item_id_idx" ON "anomalies"("sync_item_id");

-- CreateIndex
CREATE INDEX "anomalies_detected_at_idx" ON "anomalies"("detected_at");

-- CreateIndex
CREATE INDEX "reports_report_type_idx" ON "reports"("report_type");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moughataas" ADD CONSTRAINT "moughataas_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communes" ADD CONSTRAINT "communes_moughataa_id_fkey" FOREIGN KEY ("moughataa_id") REFERENCES "moughataas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localities" ADD CONSTRAINT "localities_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_contacts" ADD CONSTRAINT "beneficiary_contacts_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_documents" ADD CONSTRAINT "beneficiary_documents_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_histories" ADD CONSTRAINT "beneficiary_histories_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_histories" ADD CONSTRAINT "beneficiary_histories_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_social_program_id_fkey" FOREIGN KEY ("social_program_id") REFERENCES "social_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_moughataa_id_fkey" FOREIGN KEY ("moughataa_id") REFERENCES "moughataas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operation_beneficiaries" ADD CONSTRAINT "payment_operation_beneficiaries_payment_operation_id_fkey" FOREIGN KEY ("payment_operation_id") REFERENCES "payment_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operation_beneficiaries" ADD CONSTRAINT "payment_operation_beneficiaries_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_agents" ADD CONSTRAINT "operation_agents_payment_operation_id_fkey" FOREIGN KEY ("payment_operation_id") REFERENCES "payment_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_agents" ADD CONSTRAINT "operation_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_geographic_assignments" ADD CONSTRAINT "agent_geographic_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_geographic_assignments" ADD CONSTRAINT "agent_geographic_assignments_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_geographic_assignments" ADD CONSTRAINT "agent_geographic_assignments_moughataa_id_fkey" FOREIGN KEY ("moughataa_id") REFERENCES "moughataas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_geographic_assignments" ADD CONSTRAINT "agent_geographic_assignments_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_geographic_assignments" ADD CONSTRAINT "agent_geographic_assignments_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_operation_id_fkey" FOREIGN KEY ("payment_operation_id") REFERENCES "payment_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_validations" ADD CONSTRAINT "payment_validations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_validations" ADD CONSTRAINT "payment_validations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_validations" ADD CONSTRAINT "payment_validations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_validations" ADD CONSTRAINT "payment_validations_sync_batch_id_fkey" FOREIGN KEY ("sync_batch_id") REFERENCES "sync_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_batches" ADD CONSTRAINT "sync_batches_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_batches" ADD CONSTRAINT "sync_batches_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_items" ADD CONSTRAINT "sync_items_sync_batch_id_fkey" FOREIGN KEY ("sync_batch_id") REFERENCES "sync_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_items" ADD CONSTRAINT "sync_items_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_items" ADD CONSTRAINT "sync_items_linked_payment_id_fkey" FOREIGN KEY ("linked_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_payment_operation_id_fkey" FOREIGN KEY ("payment_operation_id") REFERENCES "payment_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_sync_batch_id_fkey" FOREIGN KEY ("sync_batch_id") REFERENCES "sync_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_sync_item_id_fkey" FOREIGN KEY ("sync_item_id") REFERENCES "sync_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
