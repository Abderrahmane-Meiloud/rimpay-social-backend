import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// ============================================================================
// Fixed institutional local accounts (INSTITUTIONAL-RBAC-2).
//
// Creates exactly three accounts, one per institutional web role:
//   admin@taazor.mr      -> ADMIN_TAAZOUR
//   program@taazor.mr    -> PROGRAMME
//   operator@taazor.mr   -> OPERATOR
//
// Safety gates:
//   - Refuses to run when NODE_ENV=production.
//   - Refuses to run unless DEMO_FIXED_ACCOUNTS=true.
//   - Refuses to run unless all three password env vars are set.
// Passwords are read from environment variables only, hashed with the
// application's standard bcrypt cost, and NEVER printed. Only email, role,
// and created/updated status are logged. Idempotent: running twice updates
// the existing accounts in place rather than duplicating them.
// ============================================================================

const BCRYPT_COST = 12;

export function assertSafeToRun(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run the fixed accounts seed: NODE_ENV=production. ' +
        'This seed is for local/non-production environments only.',
    );
  }

  if (process.env.DEMO_FIXED_ACCOUNTS !== 'true') {
    throw new Error(
      'Refusing to run the fixed accounts seed: DEMO_FIXED_ACCOUNTS is not ' +
        '"true". Set DEMO_FIXED_ACCOUNTS=true to explicitly confirm you want ' +
        'to create/update the fixed local accounts.',
    );
  }
}

export interface FixedAccountDef {
  email: string;
  fullName: string;
  roleName: 'ADMIN_TAAZOUR' | 'PROGRAMME' | 'OPERATOR';
  passwordEnvVar: string;
}

export const fixedAccounts: FixedAccountDef[] = [
  {
    email: 'admin@taazor.mr',
    fullName: 'Administrateur TAAZOUR',
    roleName: 'ADMIN_TAAZOUR',
    passwordEnvVar: 'DEMO_ADMIN_PASSWORD',
  },
  {
    email: 'program@taazor.mr',
    fullName: 'Responsable Programme',
    roleName: 'PROGRAMME',
    passwordEnvVar: 'DEMO_PROGRAMME_PASSWORD',
  },
  {
    email: 'operator@taazor.mr',
    fullName: 'Responsable Opérateur',
    roleName: 'OPERATOR',
    passwordEnvVar: 'DEMO_OPERATOR_PASSWORD',
  },
];

// Minimal fixed scoping fixtures required for program@taazor.mr and
// operator@taazor.mr to be functionally valid accounts (a PROGRAMME user
// with no programme scope, or an OPERATOR user with no linked ACTIVE
// operator, is otherwise locked out of the system by design — see
// AuthService.isOperatorScopeValid and the beneficiaries/payments/
// payment-operations row-level scoping). These are real institutional
// fixtures, not fictional/demo data.
const FIXED_OPERATOR_CODE = 'TAAZOUR-FIXED-OPERATOR';
const FIXED_PROGRAMME_CODE = 'TAAZOUR-FIXED-PROGRAMME';

export function assertPasswordsConfigured(): void {
  const missing = fixedAccounts.filter((a) => !process.env[a.passwordEnvVar]);
  if (missing.length > 0) {
    throw new Error(
      'Refusing to run the fixed accounts seed: missing required password ' +
        `environment variable(s): ${missing.map((a) => a.passwordEnvVar).join(', ')}.`,
    );
  }
}

export interface FixedAccountResult {
  email: string;
  role: string;
  status: 'created' | 'updated';
}

async function ensureFixedOperator(prisma: PrismaClient): Promise<string> {
  const operator = await prisma.operator.upsert({
    where: { code: FIXED_OPERATOR_CODE },
    update: { status: 'ACTIVE' },
    create: {
      name: 'Opérateur TAAZOUR (compte fixe)',
      code: FIXED_OPERATOR_CODE,
      status: 'ACTIVE',
    },
  });
  return operator.id;
}

async function ensureFixedProgramme(prisma: PrismaClient): Promise<string> {
  const programme = await prisma.socialProgram.upsert({
    where: { code: FIXED_PROGRAMME_CODE },
    update: {},
    create: {
      name: 'Programme TAAZOUR (compte fixe)',
      code: FIXED_PROGRAMME_CODE,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2030-12-31'),
    },
  });
  return programme.id;
}

export async function seedFixedAccounts(
  prisma: PrismaClient,
): Promise<FixedAccountResult[]> {
  const results: FixedAccountResult[] = [];

  const [fixedOperatorId, fixedProgrammeId] = await Promise.all([
    ensureFixedOperator(prisma),
    ensureFixedProgramme(prisma),
  ]);

  for (const account of fixedAccounts) {
    const password = process.env[account.passwordEnvVar];
    if (!password) {
      // Already asserted by assertPasswordsConfigured(), defensive re-check.
      throw new Error(`Missing password for ${account.email}`);
    }

    const role = await prisma.role.findUniqueOrThrow({
      where: { name: account.roleName },
    });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const existingUser = await prisma.user.findUnique({
      where: { email: account.email },
    });

    const operatorId =
      account.roleName === 'OPERATOR' ? fixedOperatorId : undefined;

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        fullName: account.fullName,
        passwordHash,
        status: 'ACTIVE',
        operatorId,
      },
      create: {
        email: account.email,
        fullName: account.fullName,
        passwordHash,
        status: 'ACTIVE',
        operatorId,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    if (account.roleName === 'PROGRAMME') {
      await prisma.userProgrammeScope.upsert({
        where: {
          userId_socialProgramId: {
            userId: user.id,
            socialProgramId: fixedProgrammeId,
          },
        },
        update: {},
        create: { userId: user.id, socialProgramId: fixedProgrammeId },
      });
    }

    results.push({
      email: account.email,
      role: account.roleName,
      status: existingUser ? 'updated' : 'created',
    });
  }

  return results;
}

async function main() {
  assertSafeToRun();
  assertPasswordsConfigured();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const results = await seedFixedAccounts(prisma);
    console.log('Fixed accounts ensured:');
    for (const r of results) {
      console.log(`  - ${r.email} (${r.role}): ${r.status}`);
    }
    console.log('Fixed accounts seed completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      'Fixed accounts seed failed:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
