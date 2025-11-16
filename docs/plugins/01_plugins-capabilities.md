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

The manifest builder resolves these flags into `plugins.<namespace>.sovereign.platformCapabilitiesResolved` inside `manifest.json`, so ops and UI surfaces can display the exact set (e.g., `["database","git"]`). Only the following allow-listed capabilities are currently accepted (mirrors `docs/architecture.md#capability-model`):

| Capability   | Injected Service             | Risk     | Production notes                                                  |
| ------------ | ---------------------------- | -------- | ----------------------------------------------------------------- |
| `database`   | Prisma client (`ctx.prisma`) | critical | Full read/write DB access—declare only when absolutely necessary. |
| `git`        | Git manager helpers          | high     | Touches repo-backed content (blog, PaperTrail).                   |
| `fs`         | File-system adapter          | high     | Scoped to plugin storage; avoid persisting secrets.               |
| `env`        | `refreshEnvCache`            | medium   | Allows forcing env refresh; audit usage in production.            |
| `uuid`       | `uuid()` helper              | low      | Pure utility; deterministic IDs.                                  |
| `mailer`     | Transactional mailer         | high     | Sends email; ensure compliance opt-ins.                           |
| `fileUpload` | Upload helper (experimental) | medium   | Disabled in prod unless `CAPABILITY_FILE_UPLOAD_ENABLED=true`.    |

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

- `yarn build:manifest` and `yarn prepare:db` now call `node tools/database-seed-plugins.mjs` automatically.
- The seeder validates role keys against `platform/scripts/data/rbac.json`, upserts definitions into the `user_capabilities` table (including metadata), rewires role assignments, and writes a lock file at `data/plugin-capabilities.lock.json` so removals can be audited.
- To run it manually (e.g., after editing `plugin.json`): `node tools/database-seed-plugins.mjs`.
- If you remove a capability, the next seed logs a warning indicating which role assignments require cleanup.

### Adding a New Capability Type

1. Update `platform/src/ext-host/capabilities.js` with the new capability key, its risk tier, and the resolver that should be injected into plugin contexts.
2. Document the capability in this file and in `README.md` so plugin authors know how to request it.
3. Ensure any required infrastructure (e.g., new services) exists in the platform runtime.
4. Add tests covering the new capability (extend `tests/ext-host-capabilities.test.mjs`).
5. Rebuild the manifest and re-run the seeder.

## Plugin Route Helpers

Within plugin routes, prefer the built-in helpers exposed on the context. The pattern below gates the handler with both user and platform capability checks, so violations fail early with standard 401/403 responses:

```js
router.post(
  "/:id/posts",
  ctx.pluginAuth.require({
    capabilities: ["user:plugin.blog.post.create"],
  }),
  async (req, res) => {
    ctx.assertPlatformCapability("database"); // plugin declared database access
    ctx.assertUserCapability(req, "user:plugin.blog.post.create");
    const post = await ctx.prisma.blogPost.create({
      /* ... */
    });
    res.json(post);
  }
);
```

For composite flows you can stack guards—e.g., require a role plus a consent-level capability, then assert a second capability deeper in the handler:

```js
router.delete(
  "/:id/posts/:postId",
  ctx.pluginAuth.require({
    roles: ["project:admin"],
    capabilities: ["user:plugin.blog.post.delete"],
  }),
  async (req, res) => {
    ctx.assertPlatformCapability("database");
    ctx.assertUserCapability(req, "user:plugin.blog.post.delete", { minValue: "compliance" });
    await ctx.prisma.blogPost.delete({ where: { id: req.params.postId } });
    res.sendStatus(204);
  }
);
```

This keeps role + capability checks consistent across plugins, makes logs usable (`PluginCapabilityError` contains metadata), and ensures every route explicitly documents the permissions it depends on.
