import fs from "fs";
import path from "path";

const rbacPath = path.resolve(process.cwd(), "prisma/seed/data/rbac.json");
const rbac = JSON.parse(fs.readFileSync(rbacPath, "utf8"));

const FALLBACK_CAPABILITY_DESCRIPTION = "[auto] capability description missing in rbac.json";

export default async function seedRBAC(prisma) {
  const catalog = new Map();

  // Seed capabilities (dedupe while keeping first description)
  for (const cap of rbac.capabilities_catalog) {
    if (!cap?.key) continue;
    const key = String(cap.key).trim();
    if (!key) continue;

    if (!catalog.has(key)) {
      catalog.set(key, cap.description || "");
    } else {
      console.warn(`seedRBAC: duplicate capability '${key}' encountered in catalog`);
    }

    await prisma.userCapability.upsert({
      where: { key },
      update: { description: cap.description },
      create: { key, description: cap.description },
    });
  }

  const ensureCapability = async (capabilityKey) => {
    const key = String(capabilityKey || "").trim();
    if (!key) return null;

    if (!catalog.has(key)) {
      console.warn(
        `seedRBAC: capability '${key}' missing from catalog; creating placeholder description`
      );
      await prisma.userCapability.upsert({
        where: { key },
        update: { description: FALLBACK_CAPABILITY_DESCRIPTION },
        create: { key, description: FALLBACK_CAPABILITY_DESCRIPTION },
      });
      catalog.set(key, FALLBACK_CAPABILITY_DESCRIPTION);
    }
    return key;
  };

  // Seed roles
  for (const role of rbac.roles) {
    const roleId = Number(role.id);
    if (!Number.isFinite(roleId)) {
      throw new Error(
        `seedRBAC: role '${role.key}' has invalid id '${role.id}' – expected numeric`
      );
    }

    await prisma.userRole.upsert({
      where: { key: role.key },
      update: {
        label: role.label,
        level: role.level,
        scope: role.scope,
        description: role.description,
      },
      create: {
        id: roleId,
        key: role.key,
        label: role.label,
        level: role.level,
        scope: role.scope,
        description: role.description,
      },
    });

    // Seed role-capabilities
    for (const [capKey, value] of Object.entries(role.capabilities)) {
      const ensuredKey = await ensureCapability(capKey);
      if (!ensuredKey) continue;

      await prisma.userRoleCapability.upsert({
        where: {
          roleId_capabilityKey: {
            roleId,
            capabilityKey: ensuredKey,
          },
        },
        update: { value },
        create: {
          roleId,
          capabilityKey: ensuredKey,
          value,
        },
      });
    }
  }
}
