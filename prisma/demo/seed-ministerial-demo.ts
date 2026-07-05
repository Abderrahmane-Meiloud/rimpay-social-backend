import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import {
  DEMO_CODE_PREFIX,
  DEMO_UNKNOWN_DEVICE_UID,
  demoAccounts,
  demoAgents,
  demoAnomalyTemplates,
  demoGeography,
  demoOperations,
  demoProgram,
  buildDemoBeneficiaries,
} from './ministerial-demo.data';

// Default location for the local, Git-ignored credentials file. This path
// intentionally lives OUTSIDE any Git repository (backend/, frontend/, and
// all tracked documentation paths): it sits at the workspace root ("RIMPay
// Social/"), which is not itself a Git repository, so it can never be
// accidentally staged or committed. Overridable only for tests, via
// DEMO_CREDENTIALS_FILE_PATH.
//
// __dirname at runtime is backend/dist/prisma/demo (compiled) or
// backend/prisma/demo (ts-node/ts-jest, since this file lives at
// backend/prisma/demo/*.ts); the workspace root is two levels above
// backend/dist or backend/ either way.
function resolveWorkspaceRoot(): string {
  const backendRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
    ? path.resolve(__dirname, '..', '..', '..')
    : path.resolve(__dirname, '..', '..');
  return path.resolve(backendRoot, '..');
}

const DEFAULT_CREDENTIALS_FILE_PATH = path.join(
  resolveWorkspaceRoot(),
  '.ministerial-demo-credentials.local.json',
);

const BCRYPT_COST = 12;

// ============================================================================
// Safety gates
// ============================================================================
//
// This seed exists ONLY to populate a fully fictional ministerial demo
// dataset ("Programme National de Soutien Familial — Démonstration"). It
// must never run against a production database, and must never run without
// an explicit, deliberate local confirmation flag — this prevents a
// misconfigured CI job or an accidental `npm run` from silently inserting
// demonstration rows into a real environment.

export function assertSafeToRun(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    throw new Error(
      'Refusing to run the ministerial demo seed: NODE_ENV=production. ' +
        'This seed is for local demonstration environments only and must ' +
        'never run against production.',
    );
  }

  if (process.env.DEMO_DATA_MODE !== 'true') {
    throw new Error(
      'Refusing to run the ministerial demo seed: DEMO_DATA_MODE is not ' +
        '"true". Set DEMO_DATA_MODE=true to explicitly confirm you want to ' +
        'populate this local database with fictional demonstration data.',
    );
  }
}

// ============================================================================
// Random demo password generation
// ============================================================================
//
// Demo account passwords are randomly generated per run (never a hardcoded
// literal, never embedded in frontend code). They are NEVER printed to
// stdout or stderr, and never written to any application log. The only
// sanctioned destination for a generated password is the local,
// Git-ignored credentials file (see writeCredentialsFileIfEnabled), and
// only when the operator explicitly opts in via DEMO_CREDENTIALS_FILE=true.

function generateDemoPassword(seedIndex: number): string {
  const randomSuffix = randomBytes(6).toString('hex');
  return `Demo${seedIndex}#${randomSuffix}Aa!`;
}

// ============================================================================
// Geography
// ============================================================================

async function seedDemoGeography(prisma: PrismaClient) {
  let regions = 0;
  let moughataas = 0;
  let communes = 0;
  let localities = 0;
  const localityIds: string[] = [];

  for (const region of demoGeography) {
    const regionRecord = await prisma.region.upsert({
      where: { code: region.code },
      update: { name: region.name },
      create: { code: region.code, name: region.name },
    });
    regions++;

    for (const moughataa of region.moughataas) {
      const moughataaRecord = await prisma.moughataa.upsert({
        where: { code: moughataa.code },
        update: { name: moughataa.name, regionId: regionRecord.id },
        create: {
          code: moughataa.code,
          name: moughataa.name,
          regionId: regionRecord.id,
        },
      });
      moughataas++;

      for (const commune of moughataa.communes) {
        const communeRecord = await prisma.commune.upsert({
          where: { code: commune.code },
          update: { name: commune.name, moughataaId: moughataaRecord.id },
          create: {
            code: commune.code,
            name: commune.name,
            moughataaId: moughataaRecord.id,
          },
        });
        communes++;

        for (const locality of commune.localities) {
          const localityRecord = await prisma.locality.upsert({
            where: { code: locality.code },
            update: { name: locality.name, communeId: communeRecord.id },
            create: {
              code: locality.code,
              name: locality.name,
              communeId: communeRecord.id,
            },
          });
          localities++;
          localityIds.push(localityRecord.id);
        }
      }
    }
  }

  return { regions, moughataas, communes, localities, localityIds };
}

// ============================================================================
// Programme
// ============================================================================

async function seedDemoProgram(prisma: PrismaClient) {
  const record = await prisma.socialProgram.upsert({
    where: { code: demoProgram.code },
    update: {
      name: demoProgram.name,
      type: demoProgram.type,
      institution: demoProgram.institution,
      description: demoProgram.description,
      status: demoProgram.status,
    },
    create: {
      code: demoProgram.code,
      name: demoProgram.name,
      type: demoProgram.type,
      institution: demoProgram.institution,
      description: demoProgram.description,
      status: demoProgram.status,
      startDate: new Date(demoProgram.startDate),
      endDate: new Date(demoProgram.endDate),
    },
  });

  return { programId: record.id };
}

// ============================================================================
// Beneficiaries
// ============================================================================

async function seedDemoBeneficiaries(prisma: PrismaClient, localityIds: string[]) {
  const definitions = buildDemoBeneficiaries();
  let created = 0;
  const beneficiaryIds: string[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const b = definitions[i];
    const existing = await prisma.beneficiary.findUnique({
      where: { registryCode: b.registryCode },
    });
    if (existing) {
      beneficiaryIds.push(existing.id);
      continue;
    }

    const localityId = localityIds[i % localityIds.length];
    const record = await prisma.beneficiary.create({
      data: {
        registryCode: b.registryCode,
        fullName: b.fullName,
        nni: b.nni,
        gender: b.gender,
        localityId,
        status: 'ACTIVE',
        source: 'MINISTERIAL_DEMO',
        notes: 'Donnée entièrement fictive — démonstration ministérielle uniquement.',
      },
    });

    await prisma.beneficiaryContact.create({
      data: {
        beneficiaryId: record.id,
        type: 'PRIMARY',
        phone: b.phone,
        ownerName: b.fullName,
        isVerified: true,
      },
    });

    beneficiaryIds.push(record.id);
    created++;
  }

  return { created, beneficiaryIds };
}

// ============================================================================
// Agents and devices
// ============================================================================

async function seedDemoAgents(prisma: PrismaClient) {
  let created = 0;
  const agentIds: string[] = [];
  const deviceIds: string[] = [];

  const agentRole = await prisma.role.findUnique({ where: { name: 'AGENT' } });

  for (const a of demoAgents) {
    const existingAgent = await prisma.agent.findUnique({
      where: { employeeCode: a.code },
    });
    if (existingAgent) {
      agentIds.push(existingAgent.id);
      const devices = await prisma.device.findMany({
        where: { agentId: existingAgent.id },
        select: { id: true },
      });
      deviceIds.push(...devices.map((d) => d.id));
      continue;
    }

    const existingUser = await prisma.user.findUnique({ where: { email: a.email } });
    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const passwordHash = await bcrypt.hash(generateDemoPassword(0), BCRYPT_COST);
      const user = await prisma.user.create({
        data: {
          email: a.email,
          passwordHash,
          fullName: a.name,
          status: 'ACTIVE',
        },
      });
      userId = user.id;
    }

    if (agentRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: agentRole.id } },
        update: {},
        create: { userId, roleId: agentRole.id },
      });
    }

    const agent = await prisma.agent.create({
      data: {
        userId,
        phone: a.phone,
        employeeCode: a.code,
        status: 'ACTIVE',
      },
    });

    const device = await prisma.device.create({
      data: {
        agentId: agent.id,
        deviceUid: a.deviceUid,
        platform: 'Android',
        model: 'Terminal Démonstration',
        appVersion: 'demo-1.0.0',
        status: 'ACTIVE',
      },
    });

    agentIds.push(agent.id);
    deviceIds.push(device.id);
    created++;
  }

  return { created, agentIds, deviceIds };
}

// ============================================================================
// Payment operations
// ============================================================================

async function seedDemoOperations(prisma: PrismaClient, programId: string) {
  let created = 0;
  const operationIds: string[] = [];

  for (const op of demoOperations) {
    const existing = await prisma.paymentOperation.findUnique({
      where: { code: op.code },
    });
    if (existing) {
      operationIds.push(existing.id);
      continue;
    }

    const region = await prisma.region.findUnique({ where: { code: op.regionCode } });

    const record = await prisma.paymentOperation.create({
      data: {
        socialProgramId: programId,
        name: op.name,
        code: op.code,
        period: op.period,
        status: op.status,
        plannedAmount: op.plannedAmount,
        paidAmount: 0,
        executionRate: 0,
        regionId: region?.id ?? null,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });

    operationIds.push(record.id);
    created++;
  }

  return { created, operationIds };
}

async function assignAgentsToOperations(
  prisma: PrismaClient,
  operationIds: string[],
  agentIds: string[],
) {
  // Every agent is assigned to every operation except the first one, so
  // that the "agent not assigned" anomaly narrative (agent 3 attempting to
  // validate on operation 1) is realistic and reproducible.
  let created = 0;
  for (let opIdx = 0; opIdx < operationIds.length; opIdx++) {
    for (let agentIdx = 0; agentIdx < agentIds.length; agentIdx++) {
      const isUnassignedNarrative = opIdx === 0 && agentIdx === agentIds.length - 1;
      if (isUnassignedNarrative) continue;

      const existing = await prisma.operationAgent.findUnique({
        where: {
          paymentOperationId_agentId: {
            paymentOperationId: operationIds[opIdx],
            agentId: agentIds[agentIdx],
          },
        },
      });
      if (existing) continue;

      await prisma.operationAgent.create({
        data: {
          paymentOperationId: operationIds[opIdx],
          agentId: agentIds[agentIdx],
          status: 'ACTIVE',
        },
      });
      created++;
    }
  }
  return { created };
}

// ============================================================================
// Payments
// ============================================================================

const PAYMENT_STATUS_CYCLE = ['PAID', 'PAID', 'PENDING', 'PAID', 'CANCELLED', 'PENDING'] as const;
const PAYMENT_AMOUNTS = [1000, 1500, 2000, 2500, 3000];

async function seedDemoPayments(
  prisma: PrismaClient,
  operationIds: string[],
  beneficiaryIds: string[],
) {
  let paymentsCreated = 0;
  let pobCreated = 0;
  const paymentIds: string[] = [];

  // Distribute beneficiaries across operations so that each operation gets
  // a meaningful share of the >= 40 required payment records overall.
  const perOperation = Math.ceil(beneficiaryIds.length / operationIds.length);

  let benIdx = 0;
  for (const operationId of operationIds) {
    for (let j = 0; j < perOperation && benIdx < beneficiaryIds.length; j++, benIdx++) {
      const beneficiaryId = beneficiaryIds[benIdx];
      const amount = PAYMENT_AMOUNTS[benIdx % PAYMENT_AMOUNTS.length];
      const status = PAYMENT_STATUS_CYCLE[benIdx % PAYMENT_STATUS_CYCLE.length];

      const existingPob = await prisma.paymentOperationBeneficiary.findUnique({
        where: {
          paymentOperationId_beneficiaryId: {
            paymentOperationId: operationId,
            beneficiaryId,
          },
        },
      });
      if (!existingPob) {
        await prisma.paymentOperationBeneficiary.create({
          data: {
            paymentOperationId: operationId,
            beneficiaryId,
            plannedAmount: amount,
            status: 'INCLUDED',
          },
        });
        pobCreated++;
      }

      const existingPayment = await prisma.payment.findUnique({
        where: {
          paymentOperationId_beneficiaryId: {
            paymentOperationId: operationId,
            beneficiaryId,
          },
        },
      });
      if (existingPayment) {
        paymentIds.push(existingPayment.id);
        continue;
      }

      const record = await prisma.payment.create({
        data: {
          paymentOperationId: operationId,
          beneficiaryId,
          amount,
          status,
          syncStatus: status === 'PAID' ? 'SYNCED' : 'NOT_SYNCED',
          plannedAt: new Date('2026-02-01'),
          paidAt: status === 'PAID' ? new Date('2026-02-15') : null,
          cancelledAt: status === 'CANCELLED' ? new Date('2026-02-20') : null,
        },
      });
      paymentIds.push(record.id);
      paymentsCreated++;
    }
  }

  // Refresh operation totals for dashboard-ready aggregates.
  for (const operationId of operationIds) {
    const op = await prisma.paymentOperation.findUniqueOrThrow({ where: { id: operationId } });
    const paidAgg = await prisma.payment.aggregate({
      where: { paymentOperationId: operationId, status: 'PAID' },
      _sum: { amount: true },
    });
    const paidAmount = Number(paidAgg._sum.amount ?? 0);
    const plannedAmount = Number(op.plannedAmount ?? 1);
    const executionRate =
      plannedAmount > 0 ? Math.min((paidAmount / plannedAmount) * 100, 100) : 0;

    await prisma.paymentOperation.update({
      where: { id: operationId },
      data: {
        paidAmount,
        executionRate: Math.round(executionRate * 100) / 100,
      },
    });
  }

  return { paymentsCreated, pobCreated, paymentIds };
}

// ============================================================================
// Anomalies (exactly the 5 required narrative categories + resolved extra)
// ============================================================================

async function seedDemoAnomalies(
  prisma: PrismaClient,
  context: {
    beneficiaryIds: string[];
    operationIds: string[];
    agentIds: string[];
    paymentIds: string[];
  },
) {
  let created = 0;

  for (let i = 0; i < demoAnomalyTemplates.length; i++) {
    const template = demoAnomalyTemplates[i];

    const existing = await prisma.anomaly.findFirst({
      where: { description: template.description },
    });
    if (existing) continue;

    const beneficiaryId = context.beneficiaryIds[i % context.beneficiaryIds.length];
    const paymentOperationId = context.operationIds[i % context.operationIds.length];
    const paymentId = context.paymentIds[i % context.paymentIds.length];
    const agentId = context.agentIds[i % context.agentIds.length];
    const isUnknownDevice = template.type === 'UNKNOWN_DEVICE';

    await prisma.anomaly.create({
      data: {
        type: template.type,
        severity: template.severity,
        status: template.status,
        entityType: isUnknownDevice ? 'Device' : 'Payment',
        // For UNKNOWN_DEVICE, entityId carries the fictional, never-registered
        // device UID referenced narratively in the description — no Device
        // row exists for this identifier, by design.
        entityId: isUnknownDevice ? DEMO_UNKNOWN_DEVICE_UID : null,
        description: template.description,
        beneficiaryId,
        paymentId,
        paymentOperationId,
        agentId: template.type === 'AGENT_NOT_ASSIGNED' ? agentId : null,
        deviceId: null,
        resolvedAt: template.status === 'RESOLVED' ? new Date('2026-03-01') : null,
        resolutionNotes:
          template.status === 'RESOLVED'
            ? 'Résolu lors de la vérification terrain fictive — démonstration.'
            : null,
      },
    });
    created++;
  }

  return { created };
}

// ============================================================================
// Audit logs (visibly explain important demo actions)
// ============================================================================

async function seedDemoAuditLogs(
  prisma: PrismaClient,
  adminUserId: string | null,
  operationIds: string[],
) {
  const entries = [
    {
      action: 'ministerial_demo.program_created',
      entityType: 'SocialProgram',
      note: 'Création du programme de soutien familial (donnée fictive).',
    },
    {
      action: 'ministerial_demo.operation_opened',
      entityType: 'PaymentOperation',
      entityId: operationIds[1] ?? null,
      note: "Ouverture de l'opération de paiement pour le Trimestre 2 2026 (donnée fictive).",
    },
    {
      action: 'ministerial_demo.payment_validated',
      entityType: 'Payment',
      entityId: operationIds[0] ?? null,
      note: 'Validation d\'un paiement terrain par un agent de démonstration (donnée fictive).',
    },
    {
      action: 'ministerial_demo.anomaly_detected',
      entityType: 'Anomaly',
      note: 'Détection d\'une anomalie GPS lors de la validation d\'un paiement terrain (donnée fictive).',
    },
    {
      action: 'ministerial_demo.operation_closed',
      entityType: 'PaymentOperation',
      entityId: operationIds[0] ?? null,
      note: "Clôture de l'opération de paiement pour le Trimestre 1 2026 (donnée fictive).",
    },
    {
      action: 'ministerial_demo.report_exported',
      entityType: 'SocialProgram',
      note: "Export d'un rapport PDF de suivi du programme (donnée fictive).",
    },
    {
      action: 'ministerial_demo.audit_log_viewed',
      entityType: 'SocialProgram',
      note: 'Consultation du journal d\'audit par un auditeur de démonstration (donnée fictive).',
    },
    {
      action: 'ministerial_demo.dataset_seeded',
      entityType: 'SocialProgram',
      note: 'Jeu de données de démonstration ministérielle initialisé — toutes les données sont fictives.',
    },
  ];

  let created = 0;
  for (const entry of entries) {
    const existing = await prisma.auditLog.findFirst({ where: { action: entry.action } });
    if (existing) continue;

    await prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        source: 'SYSTEM',
        newValues: { note: entry.note },
      },
    });
    created++;
  }

  return { created };
}

// ============================================================================
// Demo accounts
// ============================================================================
//
// Generated passwords are NEVER logged (no console.log/console.error/
// console.warn ever receives a password value, in this file or any other).
// They are returned in-memory only, so the caller can optionally persist
// them to a local, Git-ignored credentials file (see
// writeCredentialsFileIfEnabled below) — the only sanctioned destination
// for a generated demo password.

async function seedDemoAccounts(prisma: PrismaClient) {
  const created: Array<{ email: string; role: string }> = [];
  const generatedCredentials: Array<{ email: string; role: string; password: string }> = [];

  for (let i = 0; i < demoAccounts.length; i++) {
    const account = demoAccounts[i];
    const existing = await prisma.user.findUnique({ where: { email: account.email } });

    const role = await prisma.role.findUniqueOrThrow({ where: { name: account.roleName } });

    if (existing) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: existing.id, roleId: role.id } },
        update: {},
        create: { userId: existing.id, roleId: role.id },
      });
      continue;
    }

    const password = generateDemoPassword(i + 1);
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const user = await prisma.user.create({
      data: {
        email: account.email,
        passwordHash,
        fullName: account.fullName,
        status: 'ACTIVE',
      },
    });

    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });

    created.push({ email: account.email, role: account.roleName });
    generatedCredentials.push({ email: account.email, role: account.roleName, password });
  }

  return { created, generatedCredentials };
}

// ============================================================================
// Local credentials file (the ONLY sanctioned place a generated demo
// password may ever be written).
// ============================================================================
//
// Writing this file requires an explicit opt-in (DEMO_CREDENTIALS_FILE=true)
// in addition to the seed's own DEMO_DATA_MODE=true gate, so that even a
// fully-authorized demo seed run does not write credentials to disk unless
// the operator explicitly asks for them. The file path is always outside
// every Git-tracked directory (backend/, frontend/, and all tracked
// documentation paths) and is additionally covered by .gitignore as
// defense-in-depth.

export function writeCredentialsFileIfEnabled(
  generatedCredentials: Array<{ email: string; role: string; password: string }>,
): { written: boolean; path: string | null } {
  if (process.env.DEMO_CREDENTIALS_FILE !== 'true') {
    return { written: false, path: null };
  }

  if (generatedCredentials.length === 0) {
    return { written: false, path: null };
  }

  const filePath = process.env.DEMO_CREDENTIALS_FILE_PATH || DEFAULT_CREDENTIALS_FILE_PATH;

  const payload = {
    generatedAt: new Date().toISOString(),
    warning:
      'Fichier local de démonstration — à supprimer après la présentation. Ne jamais committer ni partager.',
    accounts: generatedCredentials,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });

  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort on platforms where chmod semantics are limited (e.g.
    // Windows); the file is still local-only and Git-ignored.
  }

  return { written: true, path: filePath };
}

// ============================================================================
// Counts (safe summary only — no secrets, no raw records)
// ============================================================================

async function countDemoDataset(prisma: PrismaClient) {
  const [programmes, beneficiaries, operations, payments, anomalies, auditLogs] =
    await Promise.all([
      prisma.socialProgram.count({ where: { code: { startsWith: DEMO_CODE_PREFIX } } }),
      prisma.beneficiary.count({ where: { registryCode: { startsWith: DEMO_CODE_PREFIX } } }),
      prisma.paymentOperation.count({ where: { code: { startsWith: DEMO_CODE_PREFIX } } }),
      prisma.payment.count({
        where: { paymentOperation: { code: { startsWith: DEMO_CODE_PREFIX } } },
      }),
      prisma.anomaly.count({ where: { description: { startsWith: '[Démonstration]' } } }),
      prisma.auditLog.count({ where: { action: { startsWith: 'ministerial_demo.' } } }),
    ]);

  return { programmes, beneficiaries, operations, payments, anomalies, auditLogs };
}

// ============================================================================
// Core seed routine (exported so tests can invoke it directly against the
// test database without shelling out to a second process).
// ============================================================================

export interface MinisterialDemoSeedSummary {
  programmes: number;
  beneficiaries: number;
  operations: number;
  payments: number;
  anomalies: number;
  auditLogs: number;
}

export async function runMinisterialDemoSeed(
  prisma: PrismaClient,
): Promise<MinisterialDemoSeedSummary> {
  console.log('=== Ministerial Demo Seed: Programme National de Soutien Familial — Démonstration ===');
  console.log('Toutes les données créées par ce script sont entièrement fictives.\n');

  const geo = await seedDemoGeography(prisma);
  const program = await seedDemoProgram(prisma);
  const beneficiaries = await seedDemoBeneficiaries(prisma, geo.localityIds);
  const agents = await seedDemoAgents(prisma);
  const operations = await seedDemoOperations(prisma, program.programId);
  await assignAgentsToOperations(prisma, operations.operationIds, agents.agentIds);
  const payments = await seedDemoPayments(prisma, operations.operationIds, beneficiaries.beneficiaryIds);
  await seedDemoAnomalies(prisma, {
    beneficiaryIds: beneficiaries.beneficiaryIds,
    operationIds: operations.operationIds,
    agentIds: agents.agentIds,
    paymentIds: payments.paymentIds,
  });

  const accounts = await seedDemoAccounts(prisma);
  const adminUser = await prisma.user.findUnique({
    where: { email: 'demo.admin@demo.rimpay.local' },
  });
  await seedDemoAuditLogs(prisma, adminUser?.id ?? null, operations.operationIds);

  const totals = await countDemoDataset(prisma);

  // Safe summary only: counts and non-secret identifiers. Never prints
  // DATABASE_URL, passwords, JWTs, refresh tokens, cookies, or any other
  // credential.
  console.log('--- Résumé (aucune donnée sensible affichée) ---');
  console.log(`Programmes créés/assurés : ${totals.programmes}`);
  console.log(`Bénéficiaires créés/assurés : ${totals.beneficiaries}`);
  console.log(`Opérations créées/assurées : ${totals.operations}`);
  console.log(`Paiements créés/assurés : ${totals.payments}`);
  console.log(`Anomalies créées/assurées : ${totals.anomalies}`);
  console.log(`Journaux d'audit créés/assurés : ${totals.auditLogs}`);
  console.log(`Géographie : ${geo.regions} région(s), ${geo.moughataas} moughataa(s), ${geo.communes} commune(s), ${geo.localities} localité(s)`);
  console.log(`Agents créés cette exécution : ${agents.created}`);
  console.log(`Comptes de démonstration créés cette exécution : ${accounts.created.length}`);

  // Passwords are NEVER printed to stdout/stderr. They exist only in
  // memory at this point and are optionally persisted to a local,
  // Git-ignored file (see writeCredentialsFileIfEnabled) — the only
  // sanctioned destination for a generated demo password.
  const credentialsFile = writeCredentialsFileIfEnabled(accounts.generatedCredentials);
  if (accounts.created.length > 0) {
    if (credentialsFile.written) {
      console.log(
        `Identifiants des nouveaux comptes enregistrés localement (fichier protégé, non affiché) : ${credentialsFile.path}`,
      );
    } else {
      console.log(
        'Nouveaux comptes de démonstration créés. Aucun identifiant écrit sur disque ' +
          '(définissez DEMO_CREDENTIALS_FILE=true pour les enregistrer dans un fichier ' +
          'local protégé et ignoré par Git). Voir le runbook pour la procédure de ' +
          'réinitialisation de mot de passe.',
      );
    }
  } else {
    console.log('Aucun nouveau compte de démonstration créé (déjà existants).');
  }

  console.log('\n=== Seed de démonstration ministérielle terminé avec succès. ===');

  return totals;
}

// ============================================================================
// Main (CLI entry point)
// ============================================================================

async function main() {
  assertSafeToRun();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    await runMinisterialDemoSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      'Le seed de démonstration ministérielle a échoué :',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
