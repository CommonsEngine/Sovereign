import fs from "fs";
import path from "path";

const rbacPath = path.resolve(process.cwd(), "prisma/seed/rbac.json");
const rbac = JSON.parse(fs.readFileSync(rbacPath, "utf8"));

export default async function seedRBAC(prisma) {
  // Seed capabilities
  for (const cap of rbac.capabilities_catalog) {
    await prisma.userCapability.upsert({
      where: { key: cap.key },
      update: { description: cap.description },
      create: { key: cap.key, description: cap.description },
    });
  }

  // Seed roles
  for (const role of rbac.roles) {
    await prisma.userRole.upsert({
      where: { key: role.key },
      update: {
        label: role.label,
        level: role.level,
        scope: role.scope,
        description: role.description,
      },
      create: {
        id: role.id,
        key: role.key,
        label: role.label,
        level: role.level,
        scope: role.scope,
        description: role.description,
      },
    });

    // Seed role-capabilities
    for (const [capKey, value] of Object.entries(role.capabilities)) {
      await prisma.userRoleCapability.upsert({
        where: {
          roleId_capabilityKey: {
            roleId: role.id,
            capabilityKey: capKey,
          },
        },
        update: { value },
        create: {
          roleId: role.id,
          capabilityKey: capKey,
          value,
        },
      });
    }
  }
}
