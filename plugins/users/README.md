# @sovereign/users

## Overview
- Purpose: administrative directory for managing people across the workspace (platform or tenant admins). Provides invites, role updates, deletions, and per-user plugin enrollment.
- Surfaces platform user records with status, roles, activity, project summary, and plugin access counts.
- Ships as a core module (`framework: js`, `type: module`) with `enrollStrategy: "auto"` so it is always enabled for users allowed to see it.

## Business Functionality
- Directory: list users with status (invited/active/suspended), activity timestamps, project ownership/collaboration counts, and role badges.
- User editing: update first/last name, assign roles from the configured catalog, trigger password reset.
- Per-user plugins: view and toggle plugin enrollment per user (core plugins remain always-on).
- Deletion: removes the user and associated records (sessions, role assignments, emails, profiles, plugin overrides) and re-syncs project ownership.
- Access control: feature requires `platform:admin` or `tenant:admin` (see `plugin.json > featureAccess` and user capability `user:plugin.users.feature`).

## Enrollment Strategy
- Manifest field `enrollStrategy` controls default availability:
  - `"auto"`: plugin is enabled for users by default unless explicitly disabled.
  - `"subscribe"`: plugin is opt-in per user; must be explicitly enabled.
- Core plugins force `"auto"` and cannot be disabled for individual users.

## API Surface
- Web UI: GET `/users` (server-rendered table + modals).
- User management API (authenticated, admin scoped):
  - `PUT /api/plugins/users/:id` — update name + roles (and plugin overrides when provided).
  - `DELETE /api/plugins/users/:id` — delete user and cleanup memberships.
  - `GET /api/plugins/users/:id/plugins` — fetch per-user plugin snapshot.
  - `PUT /api/plugins/users/:id/plugins` — apply per-user plugin enable/disable overrides.

## Code Layout
- `routes/web/index.js` — renders directory view with computed stats and plugin summaries.
- `routes/api/index.js` — CRUD endpoints and plugin toggle APIs; tenant-aware access checks.
- `services/user-plugins.js` — enrollment strategy resolution, per-user snapshots, and override mutations.
- `views/users/index.html` — directory UI (search, stats, per-user plugin summary).
- `views/_partials/modal/edit-user.html` (in platform) — modal used by the view to edit roles/plugins.
- `tests/user-plugins.test.mjs` — unit tests for enrollment/override behavior.

## Development
- Prereqs: platform dev server running (`yarn dev` or `yarn workspace @sovereign/platform dev`) and DB/schema up to date (`yarn prepare:db` then apply latest migrations).
- Manifest build: `yarn build:manifest` (regenerates `manifest.json` and OpenAPI).
- Tests: `yarn test` runs core + plugin tests, including `plugins/users/tests/**/*.test.mjs`. To run just this suite:  
  `node --import ./platform/scripts/register-alias.mjs --test ./plugins/users/tests/**/*.test.mjs`
- Editing: this plugin is server-rendered (no SPA build). Templates live in `views/`; APIs in `routes/api/`; shared logic in `services/`.

## Notes
- Core enrollment logic is shared with the platform via `services/user-plugins.js`; per-user toggles ignore attempts to disable core plugins.
- Tenant admins only see and manage users within their tenant; platform admins can see all.
