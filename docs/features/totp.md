# Two-Factor Authentication (TOTP)

## Status

- Implemented behind `FEATURE_TOTP_ENABLED`; works alongside passwords and passkeys.

## Goals

- Require a second factor (time-based OTP) after primary auth (password or passkey).
- Support setup via authenticator apps, recovery codes, disable/regenerate flows.
- Enforce short-lived pending state so 2FA is always verified before a session is issued.

## Data Model

- `UserTotp`: `userId (unique)`, `secret`, `verified`, `enabledAt`, `lastUsedAt`, `failedAttempts`, `recoveryCodes (hashed)`, timestamps.
- `TotpPending`: temp 2FA gate during login (`userId`, `token`, `expiresAt`, `createdAt`).
- Migration: `platform/prisma/migrations/20251123130000_totp/migration.sql`.

## Env / Config

- Flags: `FEATURE_TOTP_ENABLED`, `TOTP_ISSUER` (defaults to app name), `TOTP_DIGITS` (6), `TOTP_PERIOD` (30s), `TOTP_DRIFT_STEPS` (window), `TOTP_RECOVERY_CODES` (count), `TOTP_RECOVERY_LENGTH`.
- See `platform/.env.example`; enable with `FEATURE_TOTP_ENABLED=true`.

## API Surface

- `POST /api/totp/setup` (authed) → `{ secret, otpauth, qrDataUrl }`.
- `POST /api/totp/verify` (authed) `{ code }` → saves secret, returns recovery codes.
- `POST /api/totp/recovery/regenerate` (authed) → new recovery codes (rotates).
- `POST /api/totp/disable` (authed) → remove TOTP for user.
- `POST /auth/totp/verify` (public, after primary auth) `{ code|recovery_code, return_to }` → finalizes session if pending token is valid.
- Pending token cookie: `svg_totp_pending`, ~10 min TTL.

## Login Flow

1. Primary auth (password or passkey) succeeds.
2. If TOTP is enabled for the user, server issues pending 2FA token (httpOnly cookie) and redirects to `/login?totp=1`.
3. User submits TOTP code or recovery code via `/auth/totp/verify`.
4. On success, pending token is cleared and a normal session cookie is issued.

## UI

- `login.html`: shows TOTP form when `totp_mode` is on; recovery code input supported.
- `settings/security`: enable/disable TOTP, show QR + secret for setup, verify code, display recovery codes, regenerate codes. Still hosts passkey management.

## Security Notes

- Recovery codes are hashed (HMAC with `APP_SECRET`); consumed on use.
- Pending token short TTL; cleared on success/expiry.
- TOTP verification rate-limited via existing `rateLimiters`.
- HTTPS recommended in production; localhost allowed for dev.

## Runbook

1. `yarn install`
2. `yarn workspace @sovereign/platform prisma:migrate`
3. Set env: `FEATURE_TOTP_ENABLED=true` and issuer/digits/period as needed in `platform/.env`.
4. Start app: `yarn dev` (or workspace dev).
5. Enable TOTP: `/settings/security` → Enable/Regenerate → scan QR → enter code → save recovery codes.
6. Login: after password/passkey, enter TOTP code; use recovery codes if app is unavailable.
