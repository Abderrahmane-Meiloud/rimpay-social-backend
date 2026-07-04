import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { permissions } from './seed/data/permissions.data';
import { roles } from './seed/data/roles.data';
import { geography } from './seed/data/geography.data';
import { socialPrograms } from './seed/data/social-programs.data';

const BCRYPT_COST = 12;

function assertNotProductionUnlessAllowed() {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowProdSeed = process.env.ALLOW_PROD_SEED === 'true';

  if (isProduction && !allowProdSeed) {
    throw new Error(
      'Refusing to run seed: NODE_ENV=production and ALLOW_PROD_SEED is not "true". ' +
        'Set ALLOW_PROD_SEED=true if you really intend to seed a production database.',
    );
  }
}

async function seedPermissions(prisma: PrismaClient) {
  let created = 0;
  let ensured = 0;

  for (const permission of permissions) {
    const existing = await prisma.permission.findUnique({
      where: { code: permission.code },
    });

    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: { code: permission.code, description: permission.description },
    });

    ensured++;
    if (!existing) {
      created++;
    }
  }

  return { created, ensured };
}

async function seedRoles(prisma: PrismaClient) {
  let created = 0;
  let ensured = 0;

  for (const role of roles) {
    const existing = await prisma.role.findUnique({
      where: { name: role.name },
    });

    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: { name: role.name, description: role.description },
    });

    ensured++;
    if (!existing) {
      created++;
    }
  }

  return { created, ensured };
}

async function seedRolePermissions(prisma: PrismaClient) {
  let linksEnsured = 0;

  for (const role of roles) {
    const roleRecord = await prisma.role.findUniqueOrThrow({
      where: { name: role.name },
    });

    for (const permissionCode of role.permissionCodes) {
      const permissionRecord = await prisma.permission.findUniqueOrThrow({
        where: { code: permissionCode },
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roleRecord.id,
            permissionId: permissionRecord.id,
          },
        },
        update: {},
        create: {
          roleId: roleRecord.id,
          permissionId: permissionRecord.id,
        },
      });
      linksEnsured++;
    }
  }

  return { linksEnsured };
}

async function seedAdminUser(prisma: PrismaClient) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_FULL_NAME;

  if (!email || !password || !fullName) {
    throw new Error(
      'Missing required env vars for admin seed: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_FULL_NAME must all be set.',
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  let user: { id: string };
  let wasCreated = false;

  if (existingUser) {
    user = await prisma.user.update({
      where: { email },
      data: {
        fullName,
        status: 'ACTIVE',
      },
    });
  } else {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        status: 'ACTIVE',
      },
    });
    wasCreated = true;
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'ADMIN' },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: adminRole.id,
    },
  });

  return { email, wasCreated };
}

async function seedGeography(prisma: PrismaClient) {
  let regions = 0;
  let moughataas = 0;
  let communes = 0;
  let localities = 0;

  for (const region of geography) {
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
          await prisma.locality.upsert({
            where: { code: locality.code },
            update: { name: locality.name, communeId: communeRecord.id },
            create: {
              code: locality.code,
              name: locality.name,
              communeId: communeRecord.id,
            },
          });
          localities++;
        }
      }
    }
  }

  return { regions, moughataas, communes, localities };
}

async function seedSocialPrograms(prisma: PrismaClient) {
  let ensured = 0;

  for (const program of socialPrograms) {
    await prisma.socialProgram.upsert({
      where: { code: program.code },
      update: {
        name: program.name,
        type: program.type,
        institution: program.institution,
        description: program.description,
        status: program.status,
      },
      create: {
        code: program.code,
        name: program.name,
        type: program.type,
        institution: program.institution,
        description: program.description,
        status: program.status,
      },
    });
    ensured++;
  }

  return { ensured };
}

async function main() {
  assertNotProductionUnlessAllowed();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const permissionsResult = await seedPermissions(prisma);
    console.log(
      `Permissions ensured: ${permissionsResult.ensured} (newly created: ${permissionsResult.created})`,
    );

    const rolesResult = await seedRoles(prisma);
    console.log(`Roles ensured: ${rolesResult.ensured} (newly created: ${rolesResult.created})`);

    const rolePermissionsResult = await seedRolePermissions(prisma);
    console.log(`Role-permission links ensured: ${rolePermissionsResult.linksEnsured}`);

    const adminResult = await seedAdminUser(prisma);
    console.log(
      `Admin user ensured (${adminResult.email}): ${adminResult.wasCreated ? 'created' : 'already existed'}`,
    );

    const geographyResult = await seedGeography(prisma);
    console.log(
      `Geography ensured: ${geographyResult.regions} region(s), ${geographyResult.moughataas} moughataa(s), ${geographyResult.communes} commune(s), ${geographyResult.localities} locality(ies)`,
    );

    const programsResult = await seedSocialPrograms(prisma);
    console.log(`Social programs ensured: ${programsResult.ensured}`);

    console.log('Seed completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
