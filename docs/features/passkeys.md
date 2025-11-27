# Passwordless Login with Passkeys (WebAuthn)

## Status

- Design doc for adding passkey support; existing password + invite flows stay as fallbacks.

## Goals

- Let users sign in with platform-native passkeys (WebAuthn) with no passwords.
- Allow logged-in users to register multiple authenticators and manage them (list/delete).
- Keep login UX working when WebAuthn is unavailable (older browsers, HTTP-only dev setups).

## Components & Libraries

- Server: `@simplewebauthn/server` to issue/verify challenges and assertions.
- Client: `@simplewebauthn/browser` loaded on auth/profile pages to call WebAuthn APIs.
- Env-driven RP metadata: `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN` derived from `APP_URL` (localhost allowed in dev, HTTPS required otherwise).

## Data Model (Prisma)

- `PasskeyCredential` (new table):
  - `id` (cuid, PK), `userId` (FK User, cascade delete), `credentialId` (base64url string or bytes, unique), `publicKey`, `counter`, `deviceType`, `backedUp`, `transports` (Json), `aaguid`, `lastUsedAt`, `createdAt`.
- `PasskeyChallenge` (short-lived store/table):
  - `id` (cuid), `challenge` (base64url), `type` (`register`|`login`), `userId` (nullable for discoverable login), `emailHint` (optional), `requestedUserVerification`, `expiresAt`, `createdAt`.
- Deleting a user cascades to credentials; counters update on every successful assertion.

## API Surface (planned)

- `POST /api/passkeys/register/options` (authed): build registration options, persist challenge, set `challenge_id` httpOnly cookie.
- `POST /api/passkeys/register/verify` (authed): verify attestation, save credential row, return ok.
- `POST /api/passkeys/login/options` (public): optional `email` to narrow allowCredentials; otherwise offer discoverable credentials. Saves challenge + cookie.
- `POST /api/passkeys/login/verify` (public): verify assertion, update counter/lastUsedAt, then `createSession` to issue the normal auth cookie.
- `DELETE /api/passkeys/:id` (authed): remove own credential; block if it is the last usable login method.
- Rate limiting: public endpoints use existing `rateLimiters.public`, authed endpoints use `rateLimiters.authedApi`.

## Config / Env

- `FEATURE_PASSKEYS_ENABLED=true` gate for the entire feature.
- `WEBAUTHN_RP_ID`: host component of `APP_URL` by default (e.g., `sovereign.test`, `localhost`).
- `WEBAUTHN_RP_NAME`: display name (defaults to `APP_NAME`).
- `WEBAUTHN_ORIGIN`: scheme + host (e.g., `https://sovereign.test:3000` in dev via Caddy; must be HTTPS in prod, `http://localhost` allowed for local).
- `WEBAUTHN_TIMEOUT_MS` (optional), `WEBAUTHN_CHALLENGE_TTL_MS` (optional, defaults ~5 minutes).
- Remember to update `.env.example` and `platform/src/config/env.js` defaults.

## UX Flows

- **Passkey Sign-in (with discoverable credentials)**
  1. User clicks “Sign in with passkey”; fetch `/api/passkeys/login/options` with optional email field value.
  2. Browser runs `navigator.credentials.get` with provided options.
  3. Send assertion to `/api/passkeys/login/verify`; on success, redirect to `return_to` or `/`.
  4. If WebAuthn not available or fails, fall back to password form.

- **Passkey Registration (while signed in)**
  1. User opens account/security page and chooses “Add a passkey”.
  2. Fetch `/api/passkeys/register/options` (requires active session) → prompt `navigator.credentials.create`.
  3. POST attestation to `/api/passkeys/register/verify`; on success, show saved device label (from transports/attachment) and `lastUsedAt`.
  4. Allow multiple credentials per user (cap at e.g., 5) and provide delete buttons.

- **Removal**
  - DELETE endpoint removes a credential after confirming the user still has another login path (password or another passkey).

## Security & Validation

- Require `User.status === active` and verified primary email for both register and login.
- Enforce HTTPS origin/RP ID match; reject mismatched Host headers.
- Short-lived challenges (TTL) bound to httpOnly cookie token; delete on success/failure.
- Counter verification on every assertion; lock or delete credential if counter decreases.
- Rate-limit all public calls; log `userAgent`/`ip` on challenge and verify.
- Do not store raw passkey material; only credential IDs/public keys and metadata.

## Migration & Rollout

- Add Prisma models + migration, regenerate client, and seed feature flag defaults in env example.
- Frontend changes: augment `platform/src/views/login.html` with a passkey button + small client script; add a profile/security section for enrollment and management.
- Dev setup: run behind HTTPS (Caddy at `https://sovereign.test`) or `http://localhost` to satisfy WebAuthn requirements.
