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
 * The scoped Drizzle client returned by `sdk.db.getClient()`. The concrete,
 * dialect-specific instance is supplied by the runtime; at the contract level it
 * is opaque (refined when `sdk.db` is wired in the runtime). Plugins type their
 * own queries through their schema.
 */
export type DrizzleClient = unknown;
