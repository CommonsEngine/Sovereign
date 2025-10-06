import path from "path";
import { fileURLToPath } from "url";

import { toBool } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo root (two levels up from src/config)
const __rootdir = path.resolve(__dirname, "../..");
const __publicdir = path.join(__rootdir, "public");
// Views live under src/views
const __templatedir = path.join(__rootdir, "src", "views");

// Data dir defaults to <repo>/data unless overridden by env
const __datadir = path.resolve(
  process.env.__datadir || path.join(__rootdir, "data"),
);

const SESSION_TTL_MS =
  1000 * 60 * 60 * Number(process.env.AUTH_SESSION_TTL_HOURS ?? 720);

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_MS,
};

let cached;
export default function env() {
  if (cached) return cached;

  const defaultDbPath = path.join(__datadir, "sovereign.db");
  cached = Object.freeze({
    // from .env
    APP_URL: process.env.APP_URL || "http://localhost:3000",
    AUTH_ARGON2_ITERATIONS: Number(process.env.AUTH_ARGON2_ITERATIONS ?? 2),
    AUTH_ARGON2_MEMORY: Number(process.env.AUTH_ARGON2_MEMORY ?? 19456),
    AUTH_ARGON2_PARALLELISM: Number(process.env.AUTH_ARGON2_PARALLELISM ?? 1),
    AUTH_SESSION_COOKIE_NAME:
      process.env.AUTH_SESSION_COOKIE_NAME || "svg_session",
    AUTH_SESSION_TTL_HOURS: Number(process.env.AUTH_SESSION_TTL_HOURS ?? 720),
    DATABASE_URL: process.env.DATABASE_URL || `file:${defaultDbPath}`,

    // Feature toggles (booleans)
    FT_PROJECT_TYPE_GITCMS: toBool(process.env.FT_PROJECT_TYPE_GITCMS, true),
    FT_PROJECT_TYPE_PAPERTRAIL: toBool(
      process.env.FT_PROJECT_TYPE_PAPERTRAIL,
      false,
    ),
    FT_PROJECT_TYPE_WORKSPACE: toBool(
      process.env.FT_PROJECT_TYPE_WORKSPACE,
      false,
    ),

    GUEST_LOGIN_ENABLED: toBool(process.env.GUEST_LOGIN_ENABLED, false),
    GUEST_LOGIN_ENABLED_BYPASS_LOGIN: toBool(
      process.env.GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
      false,
    ),
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: Number(process.env.PORT) || 3000,

    // derived
    IS_PROD: (process.env.NODE_ENV || "development") === "production",
    SESSION_TTL_MS,
    COOKIE_OPTS,

    // paths
    __rootdir,
    __publicdir,
    __templatedir,
    __datadir,
  });

  return cached;
}
