# Invite-Based Registration and Multi-Use Codes

## What changed

- Added core `Invite` + `InviteUse` tables with deterministic HMAC lookup (no raw codes stored).
- New invite service builds `INV-XXXX-XXXX` base32 codes, HMACs with `APP_SECRET`, enforces per-email/domain scoping, max uses, expiry, revoke, and logs each acceptance.
- Registration now accepts invite codes directly (API or form), reuses pending/invited accounts, and redeems invites transactionally with role + project membership assignment.
- Legacy `/auth/invite` email flow now issues single-use HMAC invite codes (no verificationToken usage).
- Admin API + CLI to create/list/revoke invites with capability gating for multi-use codes.

## Data model

- `Invite`: `codeHmac`, `codePreview`, `tenantId`, `projectId`, `roleKey`, `maxUses|null`, `usedCount`, `expiresAt`, `revokedAt`, `allowedEmail`, `allowedDomain`, `createdByUserId`.
- `InviteUse`: logs `inviteId`, `userId`, `email`, `ip`, `userAgent`, `createdAt`; unique per (inviteId, userId).
- Migration: `platform/prisma/migrations/20251116213004_invite_codes/`.

## Env / config

- New `APP_SECRET` required for HMAC (defaults to insecure dev secret in `.env.example`; set for real).
- Capabilities added: `user:invite.admin.feature`, `user:invite.admin`, `user:invite.code.multi_use.feature`, `user:invite.code.multi_use`.

## API surface

- `POST /api/invites/exchange { inviteCode }` → `{ inviteToken(codeHmac), inviteId, preview, status }`.
- `POST /api/invites` (admin) create invite.
- `GET /api/invites` (admin) list; filters `tenant/project/status`.
- `GET /api/invites/:id` (admin) detail with uses.
- `POST /api/invites/:id/revoke` (admin) revoke.
- `POST /auth/register { email, password, first_name, last_name, inviteCode|inviteToken }`.
- Existing `/auth/invite` email sender now issues an HMAC invite URL: `/register?inviteCode=...`.

## CLI

- `sv invites create --role <key> [--tenant] [--project] [--max-uses N|--mode single|unlimited] [--expires <date>] [--email <addr>] [--domain <domain>]` (prints code + preview).
- `sv invites list [--tenant] [--project] [--active|--expired|--revoked] [--json]`.
- `sv invites revoke <inviteId>`.

## UX/behavioral notes

- Invite code is HMAC-checked; status gates redemption: active | revoked | expired | exhausted.
- Email/domain gating enforced on registration; form locks email when invite pre-fills allowedEmail.
- Reuses non-active invited accounts on register instead of rejecting their email.
- Accepting an invite assigns the `roleKey` and `platform:user`; if scoped to a project, membership is activated and primary owner sync runs.
