import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { permissions } from './seed/data/permissions.data';
import { roles } from './seed/data/roles.data';
import { geography } from './seed/data/geography.data';
import { socialPrograms } from './seed/data/social-programs.data';

// This is the reference-data seed only: permissions, roles, role-permission
// links, geography, and base social programme records. It intentionally
// creates no web user accounts — the three institutional fixed accounts
// (ADMIN_TAAZOUR/PROGRAMME/OPERATOR) are created exclusively by
// seed-fixed-accounts.ts, gated on DEMO_FIXED_ACCOUNTS=true.

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
      update: { description: role.description, isWebRole: role.isWebRole },
      create: {
        name: role.name,
        description: role.description,
        isWebRole: role.isWebRole,
      },
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
        startDate: new Date(program.startDate),
        endDate: new Date(program.endDate),
      },
      create: {
        code: program.code,
        name: program.name,
        type: program.type,
        institution: program.institution,
        description: program.description,
        status: program.status,
        startDate: new Date(program.startDate),
        endDate: new Date(program.endDate),
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
