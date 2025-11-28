# Features

- See `docs/features/graphql.md` for the GraphQL server plan and rollout steps.

## Guest Sessions & Data Retention

- Guest workspaces act as disposable sandboxes. When a guest signs out, every project they solely own—plus associated boards, uploads, and attachments under `data/upload` and `data/pt`—is deleted immediately.
- A background janitor re-checks for stale guest accounts every 24 hours by default and removes anything older than the configured TTL (projects, sessions, emails, PaperTrail assets, etc.), ensuring guest artifacts never linger beyond the retention window.
- Set `GUEST_BOARD_TTL_HOURS` (default: `24`) to raise or lower the automated cleanup window to meet your governance requirements; the scheduler respects this value and logs each purge with project/user context.
- Cleanup metrics (`guestCleanupMetrics` in `platform/src/utils/guestCleanup.js`) expose total runs, user purges, and project deletions so you can surface them in dashboards or probes.
- Retention behavior is part of our privacy posture: guest content is never persisted indefinitely, aligning with GDPR data-minimization expectations.

## API Rate Limiting

- All sensitive auth routes (login, registration, password flows, guest login) share a public limiter keyed by client IP to deter brute-force attempts. The defaults allow 60 requests per minute (`RATE_LIMIT_PUBLIC_MAX`) and can be tuned via env vars.
- Authenticated API calls (currently `/api/projects/**`) are rate-limited per user ID (fallback to IP) with a higher ceiling (default 300 requests/minute via `RATE_LIMIT_AUTHED_MAX`).
- `RATE_LIMIT_WINDOW_MS` controls the rolling window (default 60s) so you can tighten/loosen enforcement without code changes.
- When a client exceeds the limit, the server responds with HTTP `429 Too Many Requests`, a descriptive JSON payload, and a `Retry-After` header so callers can back off gracefully.

## Plugin Capabilities

- High-risk capabilities (such as `fileUpload`) stay disabled when `NODE_ENV=production`. If you have hardened uploads and need those plugins active in prod, set `CAPABILITY_FILE_UPLOAD_ENABLED=true` to opt in. When the flag is enabled, Sovereign logs a warning so you can track who is receiving access.

## CSS Layering & Plugin Styles

- Core styles now declare a global cascade order via `/css/sv_layers.css` (`@layer reset, base, components, utilities, plugin, platform;`). All Sovereign-provided sheets register inside the `platform.*` namespace so they always win over plugin layers regardless of load order.
- Plugins should load their CSS after the platform head includes and wrap any overrides in the `plugin` layer:

  ```css
  /* plugins/example/public/style.css */
  @layer plugin.widgets {
    .widget-card {
      border-color: color-mix(in srgb, var(--color-accent), white 60%);
    }
  }
  ```

- If a plugin needs to ship utilities/components without overriding Sovereign defaults, prefer `@layer plugin.utilities` or `@layer plugin.components`. The platform utility classes remain available at `platform.utilities.*`.
- The dedicated `/css/sv_layers.css` should be loaded before custom sheets (already handled by the default layout partial); if you build custom HTML shells, ensure that file is included so layer order stays deterministic.

## Features

### Project sharing

Projects now support collaborative access with explicit membership records. Each project can include multiple **owners**, **editors**, and **viewers**:

- Owners can configure integrations, manage content, and invite or revoke other members.
- Editors can contribute to project content but cannot modify membership.
- Viewers have read-only access.

When registering a new account, any pending email-based project invites are automatically linked to the newly created user.
