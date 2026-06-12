export interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: number | null; // SQLite boolean: 0 | 1 | NULL (NULL = active, same as default)
  createdAt: string; // better-auth stores dates as ISO 8601 strings in SQLite
}

export interface PendingInviteRow {
  email: string;
  created_at: number; // Unix timestamp (seconds)
  expires_at: number | null;
}

export interface MemberRow {
  id: string | null;
  email: string;
  name: string | null;
  role: string | null;
  status: 'active' | 'deactivated' | 'invited';
  createdAt: string;
  expiresAt: string | null;
}

/**
 * Merge registered users and pending invites into the unified member list the
 * Console users table renders. Invites for already-registered emails are
 * dropped; multiple invites to the same address are deduplicated keeping the
 * most recent (callers pass invites ordered by created_at ascending, so last
 * write wins). Expiry filtering (consumed/expired invites) is the caller's
 * responsibility — this function assumes `invites` are already pending.
 */
export function buildMemberList(users: AuthUserRow[], invites: PendingInviteRow[]): MemberRow[] {
  const registeredEmails = new Set(users.map((u) => u.email));

  const inviteByEmail = new Map<string, PendingInviteRow>();
  for (const inv of invites) {
    if (!registeredEmails.has(inv.email)) {
      inviteByEmail.set(inv.email, inv); // last write wins = most recent
    }
  }

  const userRows: MemberRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.active === 0 ? 'deactivated' : 'active',
    createdAt: u.createdAt,
    expiresAt: null,
  }));

  const inviteRows: MemberRow[] = Array.from(inviteByEmail.values()).map((inv) => ({
    id: null,
    email: inv.email,
    name: null,
    role: null,
    status: 'invited',
    createdAt: new Date(inv.created_at * 1000).toISOString(),
    expiresAt: inv.expires_at ? new Date(inv.expires_at * 1000).toISOString() : null,
  }));

  return [...userRows, ...inviteRows];
}
