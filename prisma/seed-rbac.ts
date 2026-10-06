/**
 * Seeds the fixed system roles + permissions (brief §5) and their default grants.
 * Idempotent — safe to re-run; uses upsert throughout. Run with `npm run seed:rbac`.
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../src/api/common/rbac.constants";

const prisma = new PrismaClient();

async function main() {
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key },
    });
  }
  console.log(`Seeded ${Object.values(PERMISSIONS).length} permissions.`);

  for (const [roleName, permissionKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
    console.log(`Seeded role "${roleName}" with ${permissionKeys.length} permission(s).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
