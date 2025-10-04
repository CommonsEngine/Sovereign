import path from "path";
import { fileURLToPath } from "url";

// Resolve project root (one level up from src/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const __rootdir = path.resolve(__dirname, "..");

// Public assets live at root /public
export const __publicdir = path.join(__rootdir, "public");

export const __templatedir = path.join(__dirname, "views");

// Data dir defaults to <repo>/data unless overridden by env
export const __datadir = path.resolve(
  process.env.__datadir || path.join(__rootdir, "data"),
);

// Guest login feature flags
export const GUEST_LOGIN_ENABLED = process.env.GUEST_LOGIN_ENABLED === "true";
export const GUEST_LOGIN_ENABLED_BYPASS_LOGIN =
  process.env.GUEST_LOGIN_ENABLED_BYPASS_LOGIN === "true";

// Auth
export const SESSION_COOKIE =
  process.env.AUTH_SESSION_COOKIE_NAME || "pt_session";
export const SESSION_TTL_MS =
  1000 * 60 * 60 * Number(process.env.AUTH_SESSION_TTL_HOURS ?? 720); // 30 days default
export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // HTTPS in prod
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_MS,
};
