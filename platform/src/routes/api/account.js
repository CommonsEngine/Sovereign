import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import express from "express";
import multer from "multer";

import env from "$/config/env.js";
import { prisma } from "$/services/database.js";
import { hashPassword, verifyPassword } from "$/utils/auth.js";
import rateLimiters from "$/middlewares/rateLimit.js";
import { requireAuth } from "$/middlewares/auth.js";

const config = env();
const PROFILE_PICTURE_MAX_BYTES = Number(config.PROFILE_PICTURE_MAX_BYTES ?? 2 * 1024 * 1024);
const UPLOAD_ROOT = path.join(config.__datadir, "upload", "profile-pictures");
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
]);
const LOCALE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i;
const SUPPORTED_TIMEZONES =
  typeof Intl === "object" && typeof Intl.supportedValuesOf === "function"
    ? new Set(Intl.supportedValuesOf("timeZone"))
    : null;

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const targetDir = path.join(UPLOAD_ROOT, req.user.id);
    try {
      await fs.mkdir(targetDir, { recursive: true });
      cb(null, targetDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: PROFILE_PICTURE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only PNG, JPEG, WebP, GIF, AVIF or SVG images are allowed."));
  },
});

const router = express.Router();
router.use(requireAuth, rateLimiters.authedApi);

function formatUser(record) {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name ?? null,
    firstName: record.firstName ?? null,
    lastName: record.lastName ?? null,
    pictureUrl: record.pictureUrl ?? null,
    locale: record.profile?.locale ?? null,
    timezone: record.profile?.timezone ?? null,
    primaryEmail: record.primaryEmail
      ? {
          id: record.primaryEmail.id,
          email: record.primaryEmail.email,
          isVerified: record.primaryEmail.isVerified,
        }
      : null,
  };
}

async function loadUser(userId) {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      pictureUrl: true,
      profile: {
        select: {
          locale: true,
          timezone: true,
        },
      },
      primaryEmail: {
        select: {
          id: true,
          email: true,
          isVerified: true,
        },
      },
    },
  });
  return formatUser(record);
}

async function refreshSessionSnapshots(userId) {
  try {
    await prisma.session.updateMany({
      where: { userId },
      data: { userSnapshot: null },
    });
  } catch (error) {
    console.warn("Failed to refresh session snapshots after profile update", error);
  }
}

function normalizeLocale(value) {
  if (!value) return null;
  const normalized = value.trim().replace(/_/g, "-");
  if (!normalized) return null;
  if (!LOCALE_PATTERN.test(normalized)) return null;
  const segments = normalized.split("-");
  const base = segments.shift().toLowerCase();
  const formatted = segments.map((segment) => {
    if (segment.length <= 2) return segment.toUpperCase();
    return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
  });
  return [base, ...formatted].filter(Boolean).join("-");
}

router.get("/", async (req, res) => {
  const user = await loadUser(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user });
});

router.patch("/", async (req, res) => {
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "firstName")) {
    const value =
      typeof req.body.firstName === "string" ? req.body.firstName.trim() : req.body.firstName;
    updates.firstName = value ? value : null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "lastName")) {
    const value =
      typeof req.body.lastName === "string" ? req.body.lastName.trim() : req.body.lastName;
    updates.lastName = value ? value : null;
  }

  const profilePatch = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "locale")) {
    const normalized = normalizeLocale(req.body.locale);
    if (typeof req.body.locale === "string" && req.body.locale.trim() && !normalized) {
      return res.status(400).json({ error: "Invalid locale format." });
    }
    profilePatch.locale = normalized;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "timezone")) {
    const raw = typeof req.body.timezone === "string" ? req.body.timezone.trim() : "";
    if (raw && SUPPORTED_TIMEZONES && !SUPPORTED_TIMEZONES.has(raw)) {
      return res.status(400).json({ error: "Unsupported time zone." });
    }
    if (raw) {
      profilePatch.timezone = raw;
    } else if (Object.prototype.hasOwnProperty.call(req.body, "timezone")) {
      profilePatch.timezone = null;
    }
  }

  if (Object.keys(updates).length) {
    await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
    });
  }

  if (Object.keys(profilePatch).length) {
    await prisma.userProfile.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        locale: profilePatch.locale ?? null,
        timezone: profilePatch.timezone ?? null,
      },
      update: {
        locale: profilePatch.locale ?? null,
        timezone: profilePatch.timezone ?? null,
      },
    });
  }

  await refreshSessionSnapshots(req.user.id);
  const user = await loadUser(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user });
});

router.post("/picture", upload.single("picture"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing upload." });
  }

  const relativePath = `/uploads/profile-pictures/${req.user.id}/${req.file.filename}`;
  const previous = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { pictureUrl: true },
  });

  await prisma.user.update({
    where: { id: req.user.id },
    data: { pictureUrl: relativePath },
  });

  if (previous?.pictureUrl && previous.pictureUrl.startsWith("/uploads/")) {
    const diskPath = path.join(
      config.__datadir,
      "upload",
      previous.pictureUrl.replace(/^\/uploads\//, "")
    );
    fs.rm(diskPath, { force: true }).catch(() => {
      /* ignore */
    });
  }

  await refreshSessionSnapshots(req.user.id);
  const user = await loadUser(req.user.id);
  return res.json({ user, pictureUrl: relativePath });
});

router.post("/password", async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (
    typeof newPassword !== "string" ||
    newPassword.trim().length < config.AUTH_PASSWORD_MIN_LENGTH
  ) {
    return res.status(400).json({
      error: `New password must be at least ${config.AUTH_PASSWORD_MIN_LENGTH} characters.`,
    });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirmation do not match." });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { passwordHash: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.passwordHash) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Current password is required." });
    }
    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
  }

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      passwordHash: hashed,
    },
  });
  await refreshSessionSnapshots(req.user.id);
  return res.json({ ok: true });
});

router.use((error, req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: "Unexpected error" });
});

export default router;
