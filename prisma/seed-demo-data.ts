import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const BCRYPT_COST = 12;
const DEMO_PREFIX = 'DEMO';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function count(prisma: PrismaClient) {
  const [b, o, p, a, an, au, d, u] = await Promise.all([
    prisma.beneficiary.count(),
    prisma.paymentOperation.count(),
    prisma.payment.count(),
    prisma.agent.count(),
    prisma.anomaly.count(),
    prisma.auditLog.count(),
    prisma.device.count(),
    prisma.user.count(),
  ]);
  return { beneficiaries: b, operations: o, payments: p, agents: a, anomalies: an, auditLogs: au, devices: d, users: u };
}

// ---------------------------------------------------------------------------
// Demo geography — extend existing Nouakchott with more regions
// ---------------------------------------------------------------------------

const demoGeography = [
  {
    code: 'NKC-O', name: 'Nouakchott Ouest',
    moughataas: [
      { code: 'NKC-O-SB', name: 'Sebkha', communes: [
        { code: 'NKC-O-SB-C1', name: 'Sebkha Centre', localities: [
          { code: 'NKC-O-SB-L1', name: 'Sebkha Quartier 1' },
          { code: 'NKC-O-SB-L2', name: 'Sebkha Quartier 2' },
        ]},
      ]},
    ],
  },
  {
    code: 'NKC-N', name: 'Nouakchott Nord',
    moughataas: [
      { code: 'NKC-N-AR', name: 'Arafat', communes: [
        { code: 'NKC-N-AR-C1', name: 'Arafat Centre', localities: [
          { code: 'NKC-N-AR-L1', name: 'Arafat Quartier 1' },
          { code: 'NKC-N-AR-L2', name: 'Arafat Quartier 2' },
        ]},
      ]},
    ],
  },
  {
    code: 'NKC-S', name: 'Nouakchott Sud',
    moughataas: [
      { code: 'NKC-S-EL', name: 'El Mina', communes: [
        { code: 'NKC-S-EL-C1', name: 'El Mina Centre', localities: [
          { code: 'NKC-S-EL-L1', name: 'El Mina Quartier 1' },
          { code: 'NKC-S-EL-L2', name: 'El Mina Quartier 2' },
        ]},
      ]},
    ],
  },
  {
    code: 'TRZ', name: 'Trarza',
    moughataas: [
      { code: 'TRZ-RS', name: 'Rosso', communes: [
        { code: 'TRZ-RS-C1', name: 'Rosso Centre', localities: [
          { code: 'TRZ-RS-L1', name: 'Rosso Ville' },
          { code: 'TRZ-RS-L2', name: 'Rosso Périphérie' },
        ]},
      ]},
    ],
  },
  {
    code: 'BRK', name: 'Brakna',
    moughataas: [
      { code: 'BRK-AL', name: 'Aleg', communes: [
        { code: 'BRK-AL-C1', name: 'Aleg Centre', localities: [
          { code: 'BRK-AL-L1', name: 'Aleg Ville' },
          { code: 'BRK-AL-L2', name: 'Aleg Rural' },
        ]},
      ]},
    ],
  },
  {
    code: 'ASB', name: 'Assaba',
    moughataas: [
      { code: 'ASB-KF', name: 'Kiffa', communes: [
        { code: 'ASB-KF-C1', name: 'Kiffa Centre', localities: [
          { code: 'ASB-KF-L1', name: 'Kiffa Ville' },
          { code: 'ASB-KF-L2', name: 'Kiffa Périphérie' },
        ]},
      ]},
    ],
  },
  {
    code: 'HEC', name: 'Hodh Ech Chargui',
    moughataas: [
      { code: 'HEC-NA', name: 'Nema', communes: [
        { code: 'HEC-NA-C1', name: 'Nema Centre', localities: [
          { code: 'HEC-NA-L1', name: 'Nema Ville' },
          { code: 'HEC-NA-L2', name: 'Nema Rural' },
        ]},
      ]},
    ],
  },
  {
    code: 'DKN', name: 'Dakhlet Nouadhibou',
    moughataas: [
      { code: 'DKN-ND', name: 'Nouadhibou', communes: [
        { code: 'DKN-ND-C1', name: 'Nouadhibou Centre', localities: [
          { code: 'DKN-ND-L1', name: 'Nouadhibou Ville' },
          { code: 'DKN-ND-L2', name: 'Nouadhibou Port' },
        ]},
      ]},
    ],
  },
];

async function seedDemoGeography(prisma: PrismaClient) {
  let created = 0;
  const localityIds: string[] = [];

  for (const region of demoGeography) {
    const r = await prisma.region.upsert({
      where: { code: region.code },
      update: { name: region.name },
      create: { code: region.code, name: region.name },
    });
    for (const m of region.moughataas) {
      const mr = await prisma.moughataa.upsert({
        where: { code: m.code },
        update: { name: m.name, regionId: r.id },
        create: { code: m.code, name: m.name, regionId: r.id },
      });
      for (const c of m.communes) {
        const cr = await prisma.commune.upsert({
          where: { code: c.code },
          update: { name: c.name, moughataaId: mr.id },
          create: { code: c.code, name: c.name, moughataaId: mr.id },
        });
        for (const l of c.localities) {
          const lr = await prisma.locality.upsert({
            where: { code: l.code },
            update: { name: l.name, communeId: cr.id },
            create: { code: l.code, name: l.name, communeId: cr.id },
          });
          localityIds.push(lr.id);
          created++;
        }
      }
    }
  }

  return { created, localityIds };
}

// ---------------------------------------------------------------------------
// Demo programs
// ---------------------------------------------------------------------------

const demoPrograms = [
  { code: 'DEMO-TSR', name: 'Transfert social régulier', type: 'CASH_TRANSFER', institution: 'PNRSCS', description: 'Programme de transferts monétaires réguliers aux ménages vulnérables', status: 'ACTIVE' as const },
  { code: 'DEMO-AAU', name: "Appui alimentaire d'urgence", type: 'EMERGENCY_RELIEF', institution: 'Taazour', description: "Assistance alimentaire d'urgence pour les populations affectées", status: 'ACTIVE' as const },
  { code: 'DEMO-AS', name: 'Assistance scolaire', type: 'EDUCATION', institution: 'PNRSCS', description: "Soutien financier pour la scolarisation des enfants des ménages pauvres", status: 'ACTIVE' as const },
  { code: 'DEMO-SMV', name: 'Soutien ménages vulnérables', type: 'SOCIAL_PROTECTION', institution: 'Taazour', description: 'Aide directe aux ménages identifiés comme vulnérables par le registre social', status: 'DRAFT' as const },
  { code: 'DEMO-PP', name: 'Programme pilote PNRSCS', type: 'PILOT', institution: 'PNRSCS', description: 'Programme pilote de démonstration de la plateforme nationale', status: 'ACTIVE' as const },
];

async function seedDemoPrograms(prisma: PrismaClient) {
  let created = 0;
  const programIds: string[] = [];

  for (const p of demoPrograms) {
    const existing = await prisma.socialProgram.findUnique({ where: { code: p.code } });
    const record = await prisma.socialProgram.upsert({
      where: { code: p.code },
      update: { name: p.name, type: p.type, institution: p.institution, description: p.description, status: p.status },
      create: { code: p.code, name: p.name, type: p.type, institution: p.institution, description: p.description, status: p.status },
    });
    programIds.push(record.id);
    if (!existing) created++;
  }

  return { created, programIds };
}

// ---------------------------------------------------------------------------
// Demo beneficiaries
// ---------------------------------------------------------------------------

const firstNames = [
  'Mohamed', 'Ahmed', 'Sidi', 'Oumar', 'Mamadou', 'Moussa', 'Abdallahi', 'Cheikh',
  'Aicha', 'Fatimetou', 'Mariem', 'Khadijetou', 'Aminetou', 'Meymouna', 'Zeinabou', 'Mbarka',
  'Samba', 'Ibrahima', 'Bilal', 'Youssouf', 'Hawa', 'Ndeye', 'Oumou', 'Djenaba',
];

const lastParts = [
  'Ould Demo', 'Mint Demo', 'Demo Fictif', 'Présentation', 'Ould Fictif', 'Mint Fictif',
  'Demo PNRSCS', 'Bah Demo', 'Diallo Demo', 'Sow Demo',
];

const beneficiaryStatuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'UNDER_REVIEW'] as const;

interface DemoBeneficiary {
  registryCode: string;
  fullName: string;
  nni: string;
  gender: string;
  status: typeof beneficiaryStatuses[number];
  phone: string;
}

function makeBeneficiaries(count: number): DemoBeneficiary[] {
  const result: DemoBeneficiary[] = [];
  for (let i = 0; i < count; i++) {
    const first = firstNames[i % firstNames.length];
    const last = lastParts[i % lastParts.length];
    const gender = i < 8 || (i >= 16 && i < 24) ? 'M' : 'F';
    result.push({
      registryCode: `DEMO-BEN-${String(i + 1).padStart(4, '0')}`,
      fullName: `${first} ${last}`,
      nni: `999${String(i + 1).padStart(7, '0')}`,
      gender,
      status: beneficiaryStatuses[i % beneficiaryStatuses.length],
      phone: `+222 99 ${String(90 + Math.floor(i / 10)).padStart(2, '0')} ${String(10 + (i % 100)).padStart(2, '0')} ${String(10 + i).padStart(2, '0')}`,
    });
  }
  return result;
}

async function seedDemoBeneficiaries(prisma: PrismaClient, localityIds: string[]) {
  const bens = makeBeneficiaries(50);
  let created = 0;
  const beneficiaryIds: string[] = [];

  // Also collect existing locality IDs from DB to have full pool
  const allLocalities = await prisma.locality.findMany({ select: { id: true } });
  const allLocalityIds = allLocalities.map(l => l.id);

  for (let i = 0; i < bens.length; i++) {
    const b = bens[i];
    const existing = await prisma.beneficiary.findUnique({ where: { registryCode: b.registryCode } });
    if (existing) {
      beneficiaryIds.push(existing.id);
      continue;
    }

    const locId = allLocalityIds[i % allLocalityIds.length];
    const record = await prisma.beneficiary.create({
      data: {
        registryCode: b.registryCode,
        fullName: b.fullName,
        nni: b.nni,
        gender: b.gender,
        localityId: locId,
        status: b.status,
        source: 'DEMO',
        notes: 'Donnée fictive pour démonstration PNRSCS',
      },
    });

    // Add contact
    await prisma.beneficiaryContact.create({
      data: {
        beneficiaryId: record.id,
        type: 'PRIMARY',
        phone: b.phone,
        ownerName: b.fullName,
        isVerified: Math.random() > 0.3,
      },
    });

    beneficiaryIds.push(record.id);
    created++;
  }

  return { created, beneficiaryIds };
}

// ---------------------------------------------------------------------------
// Demo agents
// ---------------------------------------------------------------------------

const agentNames = [
  { name: 'Agent Demo Nouakchott', code: 'DEMO-AGT-001', email: 'agent.demo1@rimpay.local', phone: '+222 99 80 01 01' },
  { name: 'Agent Demo Trarza', code: 'DEMO-AGT-002', email: 'agent.demo2@rimpay.local', phone: '+222 99 80 02 02' },
  { name: 'Agent Demo Brakna', code: 'DEMO-AGT-003', email: 'agent.demo3@rimpay.local', phone: '+222 99 80 03 03' },
  { name: 'Agent Demo Assaba', code: 'DEMO-AGT-004', email: 'agent.demo4@rimpay.local', phone: '+222 99 80 04 04' },
  { name: 'Agent Demo Hodh', code: 'DEMO-AGT-005', email: 'agent.demo5@rimpay.local', phone: '+222 99 80 05 05' },
  { name: 'Agent Demo Nouadhibou', code: 'DEMO-AGT-006', email: 'agent.demo6@rimpay.local', phone: '+222 99 80 06 06' },
  { name: 'Superviseur Demo NKC', code: 'DEMO-AGT-007', email: 'sup.demo1@rimpay.local', phone: '+222 99 80 07 07' },
  { name: 'Superviseur Demo Sud', code: 'DEMO-AGT-008', email: 'sup.demo2@rimpay.local', phone: '+222 99 80 08 08' },
];

async function seedDemoAgents(prisma: PrismaClient) {
  let created = 0;
  const agentIds: string[] = [];
  const deviceIds: string[] = [];

  const agentRole = await prisma.role.findUnique({ where: { name: 'AGENT' } });

  for (const a of agentNames) {
    const existingAgent = await prisma.agent.findUnique({ where: { employeeCode: a.code } });
    if (existingAgent) {
      agentIds.push(existingAgent.id);
      const devices = await prisma.device.findMany({ where: { agentId: existingAgent.id }, select: { id: true } });
      deviceIds.push(...devices.map(d => d.id));
      continue;
    }

    const passwordHash = await bcrypt.hash('DemoAgent#2026', BCRYPT_COST);
    const user = await prisma.user.create({
      data: {
        email: a.email,
        passwordHash,
        fullName: a.name,
        status: 'ACTIVE',
      },
    });

    if (agentRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: agentRole.id } },
        update: {},
        create: { userId: user.id, roleId: agentRole.id },
      });
    }

    const agent = await prisma.agent.create({
      data: {
        userId: user.id,
        phone: a.phone,
        employeeCode: a.code,
        status: 'ACTIVE',
      },
    });

    const device = await prisma.device.create({
      data: {
        agentId: agent.id,
        deviceUid: `DEMO-DEV-${a.code}`,
        platform: 'Android',
        model: 'Samsung Galaxy A14',
        appVersion: '1.0.0-demo',
        status: 'ACTIVE',
      },
    });

    agentIds.push(agent.id);
    deviceIds.push(device.id);
    created++;
  }

  return { created, agentIds, deviceIds };
}

// ---------------------------------------------------------------------------
// Demo operations
// ---------------------------------------------------------------------------

interface DemoOp {
  code: string;
  name: string;
  period: string;
  status: 'DRAFT' | 'VALIDATED' | 'OPEN' | 'IN_PROGRESS' | 'SUSPENDED' | 'CLOSED' | 'ARCHIVED';
  plannedAmount: number;
  regionCode: string;
}

const demoOperations: DemoOp[] = [
  { code: 'DEMO-OP-RAM26', name: 'Opération Ramadan 2026', period: 'Ramadan 2026', status: 'CLOSED', plannedAmount: 5000000, regionCode: 'NKC' },
  { code: 'DEMO-OP-T1NKC', name: 'Transfert Trimestre 1 — Nouakchott', period: 'T1 2026', status: 'CLOSED', plannedAmount: 8000000, regionCode: 'NKC' },
  { code: 'DEMO-OP-T2NKC', name: 'Transfert Trimestre 2 — Nouakchott', period: 'T2 2026', status: 'OPEN', plannedAmount: 8500000, regionCode: 'NKC-O' },
  { code: 'DEMO-OP-URGBRK', name: 'Assistance Urgence — Brakna', period: 'Mai 2026', status: 'IN_PROGRESS', plannedAmount: 3000000, regionCode: 'BRK' },
  { code: 'DEMO-OP-PILOT', name: 'Paiement Pilote — Registre Social', period: 'Juin 2026', status: 'OPEN', plannedAmount: 1500000, regionCode: 'NKC-S' },
  { code: 'DEMO-OP-SCOL26', name: 'Campagne Appui Scolaire 2026', period: 'Sept 2026', status: 'DRAFT', plannedAmount: 4000000, regionCode: 'ASB' },
  { code: 'DEMO-OP-T1TRZ', name: 'Transfert T1 — Trarza', period: 'T1 2026', status: 'CLOSED', plannedAmount: 2500000, regionCode: 'TRZ' },
  { code: 'DEMO-OP-URGHEC', name: 'Urgence Alimentaire — Hodh', period: 'Avr 2026', status: 'IN_PROGRESS', plannedAmount: 6000000, regionCode: 'HEC' },
  { code: 'DEMO-OP-NDBPIL', name: 'Pilote Nouadhibou', period: 'T2 2026', status: 'OPEN', plannedAmount: 2000000, regionCode: 'DKN' },
  { code: 'DEMO-OP-ASBNKC', name: 'Appui Social NKC Nord', period: 'T2 2026', status: 'VALIDATED', plannedAmount: 3500000, regionCode: 'NKC-N' },
];

async function seedDemoOperations(prisma: PrismaClient, programIds: string[]) {
  let created = 0;
  const operationIds: string[] = [];

  for (let i = 0; i < demoOperations.length; i++) {
    const op = demoOperations[i];
    const existing = await prisma.paymentOperation.findUnique({ where: { code: op.code } });
    if (existing) {
      operationIds.push(existing.id);
      continue;
    }

    const region = await prisma.region.findUnique({ where: { code: op.regionCode } });

    const record = await prisma.paymentOperation.create({
      data: {
        socialProgramId: programIds[i % programIds.length],
        name: op.name,
        code: op.code,
        period: op.period,
        status: op.status,
        plannedAmount: op.plannedAmount,
        paidAmount: 0,
        executionRate: 0,
        regionId: region?.id || null,
        startDate: new Date('2026-01-15'),
        endDate: new Date('2026-12-31'),
      },
    });

    operationIds.push(record.id);
    created++;
  }

  return { created, operationIds };
}

// ---------------------------------------------------------------------------
// Demo payments
// ---------------------------------------------------------------------------

const paymentStatuses = ['PAID', 'PAID', 'PAID', 'PAID', 'PENDING', 'PENDING', 'VALIDATED', 'CANCELLED', 'REJECTED', 'CONFLICT'] as const;
const syncStatuses = ['SYNCED', 'SYNCED', 'SYNCED', 'SYNCED', 'NOT_SYNCED', 'NOT_SYNCED', 'CONFLICT'] as const;
const amounts = [500, 1000, 1500, 2000, 2500, 3000, 5000, 7500];

async function seedDemoPayments(
  prisma: PrismaClient,
  operationIds: string[],
  beneficiaryIds: string[],
  agentIds: string[],
  deviceIds: string[],
) {
  let paymentsCreated = 0;
  let pobCreated = 0;

  // Only use demo operations (not already-existing ones)
  type OpRecord = NonNullable<Awaited<ReturnType<typeof prisma.paymentOperation.findUnique>>>;
  const demoOps: OpRecord[] = [];
  for (const oid of operationIds) {
    const op = await prisma.paymentOperation.findUnique({ where: { id: oid } });
    if (op && op.code.startsWith('DEMO-')) demoOps.push(op);
  }

  // Spread beneficiaries across operations
  const bensPerOp = Math.min(Math.floor(beneficiaryIds.length / demoOps.length), 12);
  let benIdx = 0;

  for (const op of demoOps) {
    const count = bensPerOp + (benIdx === 0 ? 5 : 0); // first op gets a few extra
    for (let j = 0; j < count && benIdx < beneficiaryIds.length; j++, benIdx++) {
      const benId = beneficiaryIds[benIdx % beneficiaryIds.length];
      const amount = amounts[(benIdx + j) % amounts.length];
      const pStatus = paymentStatuses[(benIdx + j) % paymentStatuses.length];
      const sStatus = syncStatuses[(benIdx + j) % syncStatuses.length];

      // Check if POB already exists
      const existingPob = await prisma.paymentOperationBeneficiary.findUnique({
        where: { paymentOperationId_beneficiaryId: { paymentOperationId: op.id, beneficiaryId: benId } },
      });
      if (!existingPob) {
        await prisma.paymentOperationBeneficiary.create({
          data: {
            paymentOperationId: op.id,
            beneficiaryId: benId,
            plannedAmount: amount,
            status: 'INCLUDED',
          },
        });
        pobCreated++;
      }

      // Check if payment already exists
      const existingPayment = await prisma.payment.findUnique({
        where: { paymentOperationId_beneficiaryId: { paymentOperationId: op.id, beneficiaryId: benId } },
      });
      if (existingPayment) continue;

      await prisma.payment.create({
        data: {
          paymentOperationId: op.id,
          beneficiaryId: benId,
          amount,
          status: pStatus,
          syncStatus: sStatus,
          paidAt: pStatus === 'PAID' ? new Date(Date.now() - Math.random() * 30 * 86400000) : null,
          plannedAt: new Date('2026-03-01'),
        },
      });
      paymentsCreated++;
    }
  }

  // Update operation paid amounts and execution rates
  for (const op of demoOps) {
    const paidPayments = await prisma.payment.aggregate({
      where: { paymentOperationId: op.id, status: 'PAID' },
      _sum: { amount: true },
      _count: true,
    });
    const paidAmount = Number(paidPayments._sum.amount || 0);
    const plannedAmount = Number(op.plannedAmount || 1);
    const executionRate = plannedAmount > 0 ? Math.min((paidAmount / plannedAmount) * 100, 100) : 0;

    await prisma.paymentOperation.update({
      where: { id: op.id },
      data: {
        paidAmount,
        executionRate: Math.round(executionRate * 100) / 100,
      },
    });
  }

  return { paymentsCreated, pobCreated };
}

// ---------------------------------------------------------------------------
// Demo anomalies
// ---------------------------------------------------------------------------

interface DemoAnomaly {
  type: 'DUPLICATE_NNI' | 'DUPLICATE_PHONE' | 'MULTIPLE_PAYMENT' | 'PAYMENT_ALREADY_VALIDATED' | 'MISSING_GPS' | 'SYNC_CONFLICT' | 'UNKNOWN_DEVICE' | 'AGENT_NOT_ASSIGNED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
  entityType: string;
  description: string;
}

const demoAnomalies: DemoAnomaly[] = [
  { type: 'DUPLICATE_NNI', severity: 'HIGH', status: 'OPEN', entityType: 'Beneficiary', description: 'NNI 9990000003 trouvé en double sur deux bénéficiaires différents dans la zone Nouakchott Ouest.' },
  { type: 'DUPLICATE_PHONE', severity: 'MEDIUM', status: 'OPEN', entityType: 'Beneficiary', description: 'Numéro de téléphone +222 99 90 12 12 partagé entre trois bénéficiaires.' },
  { type: 'MISSING_GPS', severity: 'LOW', status: 'OPEN', entityType: 'Payment', description: 'Validation de paiement effectuée sans coordonnées GPS — localisation non disponible sur le terminal.' },
  { type: 'AGENT_NOT_ASSIGNED', severity: 'CRITICAL', status: 'OPEN', entityType: 'Payment', description: "Agent DEMO-AGT-003 a tenté de valider un paiement dans une opération à laquelle il n'est pas affecté." },
  { type: 'PAYMENT_ALREADY_VALIDATED', severity: 'HIGH', status: 'IN_REVIEW', entityType: 'Payment', description: 'Tentative de double validation pour le paiement du bénéficiaire DEMO-BEN-0012.' },
  { type: 'SYNC_CONFLICT', severity: 'MEDIUM', status: 'OPEN', entityType: 'SyncItem', description: 'Conflit de synchronisation détecté — même paiement soumis depuis deux appareils différents.' },
  { type: 'UNKNOWN_DEVICE', severity: 'HIGH', status: 'IN_REVIEW', entityType: 'Device', description: "Appareil non enregistré a tenté une synchronisation avec l'identifiant DEV-INCONNU-001." },
  { type: 'MULTIPLE_PAYMENT', severity: 'CRITICAL', status: 'RESOLVED', entityType: 'Payment', description: 'Bénéficiaire a reçu deux paiements pour la même opération — doublon corrigé.' },
  { type: 'DUPLICATE_NNI', severity: 'MEDIUM', status: 'RESOLVED', entityType: 'Beneficiary', description: 'NNI en double résolu après vérification terrain — erreur de saisie confirmée.' },
  { type: 'MISSING_GPS', severity: 'LOW', status: 'OPEN', entityType: 'Payment', description: 'Coordonnées GPS manquantes lors de la validation terrain à Aleg (zone sans couverture réseau).' },
];

async function seedDemoAnomalies(
  prisma: PrismaClient,
  beneficiaryIds: string[],
  operationIds: string[],
  agentIds: string[],
  deviceIds: string[],
) {
  let created = 0;

  for (let i = 0; i < demoAnomalies.length; i++) {
    const a = demoAnomalies[i];

    // Use description as idempotency check (unique enough for demo)
    const existing = await prisma.anomaly.findFirst({
      where: { description: a.description },
    });
    if (existing) continue;

    await prisma.anomaly.create({
      data: {
        type: a.type,
        severity: a.severity,
        status: a.status,
        entityType: a.entityType,
        description: a.description,
        beneficiaryId: a.entityType === 'Beneficiary' ? beneficiaryIds[i % beneficiaryIds.length] : null,
        agentId: a.type === 'AGENT_NOT_ASSIGNED' ? agentIds[i % agentIds.length] : null,
        paymentOperationId: operationIds[i % operationIds.length] || null,
        resolvedAt: a.status === 'RESOLVED' ? new Date() : null,
        resolutionNotes: a.status === 'RESOLVED' ? 'Résolu lors de la vérification terrain — donnée fictive' : null,
      },
    });
    created++;
  }

  return { created };
}

// ---------------------------------------------------------------------------
// Demo audit logs
// ---------------------------------------------------------------------------

async function seedDemoAuditLogs(prisma: PrismaClient, adminUserId: string | null) {
  const demoActions = [
    { action: 'beneficiary.demo_create', entityType: 'Beneficiary', source: 'SYSTEM' as const },
    { action: 'operation.demo_create', entityType: 'PaymentOperation', source: 'SYSTEM' as const },
    { action: 'payment.demo_generate', entityType: 'Payment', source: 'SYSTEM' as const },
    { action: 'anomaly.demo_detect', entityType: 'Anomaly', source: 'SYSTEM' as const },
    { action: 'agent.demo_create', entityType: 'Agent', source: 'SYSTEM' as const },
    { action: 'device.demo_register', entityType: 'Device', source: 'SYSTEM' as const },
    { action: 'program.demo_create', entityType: 'SocialProgram', source: 'SYSTEM' as const },
    { action: 'payment.demo_validate', entityType: 'Payment', source: 'MOBILE' as const },
    { action: 'sync.demo_complete', entityType: 'SyncBatch', source: 'MOBILE' as const },
    { action: 'report.demo_view', entityType: 'Report', source: 'WEB' as const },
  ];

  let created = 0;

  for (const entry of demoActions) {
    const existing = await prisma.auditLog.findFirst({
      where: { action: entry.action },
    });
    if (existing) continue;

    await prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: entry.action,
        entityType: entry.entityType,
        source: entry.source,
        newValues: { note: 'Entrée fictive pour démonstration PNRSCS' },
      },
    });
    created++;
  }

  return { created };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    console.log('=== Demo Data Enrichment ===\n');

    const before = await count(prisma);
    console.log('BEFORE:', JSON.stringify(before, null, 2));

    // 1. Geography
    const geo = await seedDemoGeography(prisma);
    console.log(`\nGeography: ${geo.created} localities ensured across ${demoGeography.length} demo regions`);

    // 2. Programs
    const progs = await seedDemoPrograms(prisma);
    console.log(`Programs: ${progs.created} created (${demoPrograms.length} ensured)`);

    // 3. Agents
    const agents = await seedDemoAgents(prisma);
    console.log(`Agents: ${agents.created} created (${agentNames.length} ensured)`);

    // 4. Beneficiaries
    const bens = await seedDemoBeneficiaries(prisma, geo.localityIds);
    console.log(`Beneficiaries: ${bens.created} created (50 ensured)`);

    // 5. Operations
    const ops = await seedDemoOperations(prisma, progs.programIds);
    console.log(`Operations: ${ops.created} created (${demoOperations.length} ensured)`);

    // 6. Payments
    const pays = await seedDemoPayments(prisma, ops.operationIds, bens.beneficiaryIds, agents.agentIds, agents.deviceIds);
    console.log(`Payments: ${pays.paymentsCreated} created, ${pays.pobCreated} beneficiary assignments created`);

    // 7. Anomalies
    const anos = await seedDemoAnomalies(prisma, bens.beneficiaryIds, ops.operationIds, agents.agentIds, agents.deviceIds);
    console.log(`Anomalies: ${anos.created} created (${demoAnomalies.length} ensured)`);

    // 8. Audit logs
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@rimpay.local' } });
    const auditResult = await seedDemoAuditLogs(prisma, adminUser?.id || null);
    console.log(`Audit logs: ${auditResult.created} demo entries added`);

    const after = await count(prisma);
    console.log('\nAFTER:', JSON.stringify(after, null, 2));

    console.log('\n=== Demo data enrichment completed successfully. ===');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Demo seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
