import path from "node:path";
import fs from "node:fs/promises";

import env from "$/config/env.mjs";
import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";

const config = env();
const GUEST_EMAIL_SUFFIX = "@guest.local";
const GUEST_NAME_PATTERN = /^guest(?:_[0-9a-f]+)?$/i;
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const GUEST_RETENTION_MS = Math.max(
  config.GUEST_DATA_TTL_MS ?? DEFAULT_RETENTION_MS,
  60 * 60 * 1000
);
const PAPERTRAIL_DATA_ROOT = path.resolve(
  process.env.PAPERTRAIL_DATA_ROOT || path.join(config.__datadir, "pt")
);
const UPLOAD_ROOT = path.join(config.__datadir, "upload");

export const guestCleanupMetrics = {
  totalRuns: 0,
  totalUsersDeleted: 0,
  totalProjectsDeleted: 0,
  lastRunAt: null,
};

function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function collectEmails(user) {
  const seen = new Set();
  for (const record of ensureArray(user?.emails)) {
    const email = typeof record?.email === "string" ? record.email.trim().toLowerCase() : null;
    if (email) seen.add(email);
  }

  const primary =
    typeof user?.primaryEmail?.email === "string"
      ? user.primaryEmail.email.trim().toLowerCase()
      : null;
  if (primary) seen.add(primary);

  const sessionEmail =
    typeof user?.sessionEmail === "string" ? user.sessionEmail.trim().toLowerCase() : null;
  if (sessionEmail) seen.add(sessionEmail);

  const directEmail = typeof user?.email === "string" ? user.email.trim().toLowerCase() : null;
  if (directEmail) seen.add(directEmail);

  return Array.from(seen);
}

export function isGuestUser(user) {
  if (!user) return false;
  const name = typeof user.name === "string" ? user.name.trim() : "";
  if (GUEST_NAME_PATTERN.test(name)) return true;
  const emails = collectEmails(user);
  return emails.some((email) => email.endsWith(GUEST_EMAIL_SUFFIX));
}

async function findGuestOwnedProjectIds(tx, userId) {
  if (!userId) return [];

  const projects = await tx.project.findMany({
    where: {
      contributors: {
        some: {
          userId,
          role: "owner",
          status: "active",
        },
      },
    },
    select: {
      id: true,
      contributors: {
        where: { role: "owner", status: "active" },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              primaryEmail: { select: { email: true } },
              emails: { select: { email: true } },
            },
          },
        },
      },
    },
  });

  return projects
    .filter((project) => project.contributors.every(({ user }) => !user || isGuestUser(user)))
    .map((project) => project.id);
}

async function collectProjectAssetSpecs(tx, projectIds = []) {
  if (!projectIds.length) return [];
  const specs = [];

  for (const projectId of projectIds) {
    specs.push({
      projectId,
      type: "upload-root",
      path: path.join(UPLOAD_ROOT, projectId),
    });
  }

  // TODO: Should make this generic, platform doesn't need to know what are the pluging specific models
  // plugin should exporse cleanup() method
  const papertrailBoards = await tx.paperTrail.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true },
  });
  for (const board of papertrailBoards) {
    specs.push({
      projectId: board.projectId,
      boardId: board.id,
      type: "papertrail-board",
      path: path.join(PAPERTRAIL_DATA_ROOT, board.id),
    });
  }

  return specs;
}

async function cleanupAssetSpecs(specs = [], log = logger) {
  let removed = 0;
  for (const spec of specs) {
    const targetPath = spec.path;
    if (!targetPath) continue;
    let exists = true;
    try {
      await fs.stat(targetPath);
    } catch {
      exists = false;
    }
    if (!exists) continue;
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      removed += 1;
      log.info?.("Guest asset removed", {
        projectId: spec.projectId,
        boardId: spec.boardId ?? null,
        type: spec.type,
        path: targetPath,
      });
    } catch (err) {
      log.warn?.("Failed to delete guest asset path", { path: targetPath, err });
    }
  }
  return removed;
}

async function deleteProjects(tx, projectIds) {
  if (!projectIds?.length) return 0;
  const deleted = await tx.project.deleteMany({
    where: { id: { in: projectIds } },
  });
  return deleted.count || 0;
}

export async function purgeGuestUserById(userId, options = {}) {
  const log = options.logger || logger;
  const reason = options.reason || "manual";
  if (!userId) {
    return { ok: false, reason: "missing-user" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const userRecord = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          primaryEmail: { select: { email: true } },
          emails: { select: { email: true } },
        },
      });

      if (!userRecord || !isGuestUser(userRecord)) {
        return { ok: false, reason: "not-guest" };
      }

      const projectIds = await findGuestOwnedProjectIds(tx, userId);
      const assetSpecs = await collectProjectAssetSpecs(tx, projectIds);
      const projectsDeleted = await deleteProjects(tx, projectIds);

      await tx.projectContributor.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.userRoleAssignment.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.userProfile.deleteMany({ where: { userId } });
      await tx.appSetting.deleteMany({ where: { scope: `user:${userId}` } });
      await tx.papertrailComment?.deleteMany({ where: { authorId: userId } });

      await tx.user.updateMany({
        where: { id: userId },
        data: { primaryEmailId: null },
      });
      await tx.userEmail.deleteMany({ where: { userId } });

      const userDeleted = await tx.user.deleteMany({ where: { id: userId } });

      if (projectsDeleted > 0) {
        log.info?.("Deleting guest-owned projects", {
          userId,
          projectIds,
          count: projectsDeleted,
          reason,
          userType: "guest",
        });
      }

      return {
        ok: true,
        projectIds,
        assetSpecs,
        projectsDeleted,
        userDeleted: userDeleted.count > 0,
        user: {
          id: userRecord.id,
          name: userRecord.name,
          createdAt: userRecord.createdAt,
        },
      };
    });

    if (!result.ok) return result;

    const assetsRemoved = await cleanupAssetSpecs(result.assetSpecs, log);

    guestCleanupMetrics.totalProjectsDeleted += result.projectsDeleted || 0;
    if (result.userDeleted) {
      guestCleanupMetrics.totalUsersDeleted += 1;
    }

    log.info?.("✓ Purged guest user", {
      userId,
      reason,
      userType: "guest",
      projectsDeleted: result.projectsDeleted,
      assetsRemoved,
      timestamp: new Date().toISOString(),
    });

    return {
      ...result,
      assetsRemoved,
    };
  } catch (err) {
    log.error?.("✗ Failed to purge guest user", { userId, err });
    throw err;
  }
}

export async function cleanupExpiredGuestUsers(options = {}) {
  const { logger: log = logger, olderThanMs = GUEST_RETENTION_MS, batchSize = 25 } = options;

  const cutoff = new Date(Date.now() - Math.max(olderThanMs, 0));
  const guests = await prisma.user.findMany({
    where: {
      createdAt: { lt: cutoff },
      emails: {
        some: {
          email: { endsWith: GUEST_EMAIL_SUFFIX },
        },
      },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      primaryEmail: { select: { email: true } },
      emails: { select: { email: true } },
    },
    take: batchSize,
  });

  let cleaned = 0;
  let projectsDeleted = 0;
  for (const guest of guests) {
    if (!isGuestUser(guest)) continue;
    try {
      const result = await purgeGuestUserById(guest.id, { logger: log, reason: "scheduler" });
      if (result?.ok && result.userDeleted) {
        cleaned += 1;
        projectsDeleted += result.projectsDeleted || 0;
      }
    } catch (err) {
      log.warn?.("⚠︎ Guest cleanup failed for user", { userId: guest.id, err });
    }
  }

  guestCleanupMetrics.totalRuns += 1;
  guestCleanupMetrics.lastRunAt = new Date();

  log.info?.("Guest cleanup summary", {
    scanned: guests.length,
    cleaned,
    projectsDeleted,
    cutoff: cutoff.toISOString(),
    ttlHours: Math.round((GUEST_RETENTION_MS || DEFAULT_RETENTION_MS) / (60 * 60 * 1000)),
  });

  return { scanned: guests.length, cleaned, projectsDeleted };
}
