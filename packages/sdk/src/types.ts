export interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
}

export interface Session {
  user: SessionUser;
  /** Session expiry as a Unix timestamp (seconds). */
  expiresAt: number;
}

/** An authenticated session for the current user (SRS ACC-05). */
export interface ActiveSession {
  /** Opaque session token — pass to `sdk.auth.revokeSession` to end it. */
  token: string;
  /** Whether this is the session making the current request. */
  current: boolean;
  /** Raw User-Agent string of the device that created the session, if known. */
  userAgent: string | null;
  ipAddress: string | null;
  /** Creation, last-active, and expiry as ISO 8601 strings. */
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface PlatformConfig {
  tenantName: string;
  inviteOnly: boolean;
  version: string;
}

/**
 * The Drizzle client returned by `sdk.db.getClient()` — the live platform
 * Drizzle instance. Kept opaque (`unknown`) at the contract level so the
 * published SDK takes no dependency on a specific dialect's Drizzle types;
 * plugins type their own queries through their schema.
 */
export type DrizzleClient = unknown;
