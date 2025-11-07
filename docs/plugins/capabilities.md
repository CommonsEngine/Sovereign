# Plugin Capabilities Guide

This guide explains how plugins request host services, declare user-facing RBAC capabilities, and keep those declarations in sync with the platform database.

## Host Platform Capabilities

Each plugin manifest defines host access under `sovereign.platformCapabilities`. Example:

```jsonc
"sovereign": {
  "platformCapabilities": {
    "database": true,
    "git": true,
    "fs": false
  }
}
```

The manifest builder resolves these flags into `plugins.<namespace>.sovereign.platformCapabilitiesResolved` inside `manifest.json`, so ops and UI surfaces can display the exact set (e.g., `["database","git"]`). Only the following allow‑listed capabilities are currently accepted:

| Capability   | Injected Service             | Notes                           |
| ------------ | ---------------------------- | ------------------------------- |
| `database`   | Prisma client (`ctx.prisma`) | Full DB access                  |
| `git`        | Git manager helpers          | Used by blog/papertrail         |
| `fs`         | File-system adapter          | Scoped to plugin storage        |
| `env`        | `refreshEnvCache`            | Refreshes env config            |
| `uuid`       | `uuid()` helper              | Deterministic IDs               |
| `mailer`     | Transactional mailer         | Sends email                     |
| `fileUpload` | Upload helper (experimental) | Disabled in prod until hardened |

Requests for unknown caps, or caps disabled in production, cause bootstrap errors. During development you may temporarily bypass declarations by exporting `DEV_ALLOW_ALL_CAPS=true`, but this is noisy and should never reach production.

At runtime each router receives `ctx.assertPlatformCapability(key)`; calling it before using a host service ensures undeclared usage is caught with a consistent error.

## User Capabilities & RBAC Seeding

Plugins declare end-user permissions under `sovereign.userCapabilities`. Each entry may specify `scope`, `category`, `tags`, and role assignments:

```jsonc
"userCapabilities": [
  {
    "key": "user:plugin.blog.post.create",
    "description": "Create blog posts",
    "roles": ["project:admin", "project:editor"],
    "scope": "project",
    "category": "content"
  }
]
```

The manifest builder normalizes these into `manifest.pluginCapabilities.definitions` with a deterministic signature. That signature is stored in `manifest.pluginCapabilities.signature` and in every active session; when it changes, `req.user.capabilities` is automatically refreshed on the user’s next request.

### Seeding Workflow

- `yarn build:manifest` and `yarn prepare:db` now call `node tools/database-seed-plugin-capabilities.mjs` automatically.
- The seeder validates role keys against `platform/scripts/data/rbac.json`, upserts definitions into the `user_capabilities` table (including metadata), rewires role assignments, and writes a lock file at `data/plugin-capabilities.lock.json` so removals can be audited.
- To run it manually (e.g., after editing `plugin.json`): `yarn seed:plugin-capabilities`.
- If you remove a capability, the next seed logs a warning indicating which role assignments require cleanup.

### Adding a New Capability Type

1. Update `platform/src/ext-host/capabilities.mjs` with the new capability key, its risk tier, and the resolver that should be injected into plugin contexts.
2. Document the capability in this file and in `README.md` so plugin authors know how to request it.
3. Ensure any required infrastructure (e.g., new services) exists in the platform runtime.
4. Add tests covering the new capability (extend `tests/ext-host-capabilities.test.mjs`).
5. Rebuild the manifest and re-run the seeder.

## Plugin Route Helpers

Within plugin routes, prefer the built-in helpers exposed on the context:

```js
router.post(
  "/:id/posts",
  ctx.pluginAuth.require({ capabilities: ["user:plugin.blog.post.create"] }),
  async (req, res) => {
    ctx.assertPlatformCapability("database");
    ctx.assertUserCapability(req, "user:plugin.blog.post.create");
    // ... business logic ...
  }
);
```

This keeps role + capability checks consistent across plugins and ensures violations surface with a standard 403 response.
