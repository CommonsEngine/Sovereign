# RFC-0002: Plugin Manifest & Lifecycle

**Status:** Draft  
**Author:** Kasun B.
**Created:** 2025-10-21  
**Target Version:** Sovereign v0.1  
**Tags:** Tags: Plugins, SDK, Manifest, Extensibility, Lifecycle

---

## 1. Purpose

This RFC defines the structure and behavior of the Sovereign Plugin Manifest and its associated lifecycle. It ensures all plugins follow a consistent, predictable format while remaining lightweight and isolated. Plugins extend the platform without modifying core code, interacting only through stable contracts and SDK APIs.

## 2. Design Goals

- Standardize plugin definition and metadata using a manifest file.
- Provide clear lifecycle hooks for setup, enablement, and teardown.
- Support backend, frontend, and hybrid (full-stack) plugins.
- Allow plugin-specific database schemas, migrations, and configuration.
- Maintain version and API compatibility across Sovereign releases.
- Enable validation and integrity checks for plugins before activation.

## 3. Manifest File

_Example `plugin.json`_

```json
{
  "name": "@sovereign/papertrail",
  "version": "1.0.0",
  "description": "Evidence and documentation board system for Sovereign.",
  "author": "CommonsEngine Team",
  "license": "AGPL-3.0",
  "sovereign": {
    "engine": ">=0.1.0 <2.0.0",
    "entry": "./index.mjs"
  },
  "capabilities": [
    "papertrail.board.read",
    "papertrail.board.write",
    "papertrail.board.update",
    "papertrail.board.delete"
  ],
  "events": {
    "subscribe": ["board.created", "user.deleted"]
  },
  "schema": "./prisma/schema.prisma",
  "migrations": "./prisma/migrations",
  "config": {
    "PT_MAX_CARDS": { "type": "number", "default": 500 }
  }
}
```

## 4. Lifecycle Phases

The plugin passes through defined stages handled by the Extension Host.

**1. Discovery**

The extension host scans `/plugins/*/plugin.json` and validates manifests.
Invalid or incompatible plugins are skipped with logged warnings.

**2. Validation**

Manifest is validated using a JSON schema (zod or ajv).
Compatibility ranges for api and engine are checked.

**3. Initialization**

The backend entry module is imported in a sandboxed VM or worker.
The module must export an object implementing the SovereignPlugin interface.

**4. Registration**

The plugin’s register() method is called with a scoped SDK context:

```
{
  router, db, events, scheduler, config, caps, log
}
```

Plugins register routes, events, jobs, and declare capabilities here.

**5. Activation**

Optional hook: `onEnable(tenantId)`

Called when the plugin is enabled for a tenant. Used to seed data or initialize resources.

**6. Migration**

Optional hook: `onMigrate()`

Runs when the plugin schema version changes or after install. Executes plugin-provided migrations through the Prisma migration runner.

**7. Deactivation**

Optional hook: `onDisable(tenantId)`

Called when plugin is disabled or tenant deactivated. Used to clean temporary data or stop background jobs.

**8. Shutdown**

When Sovereign stops, the extension host calls `onShutdown()` if present, giving the plugin a chance to release resources gracefully.

## 5. UI Contributions

If the plugin includes a UI section, the manifest’s "ui" block declares routes and slot components. The front-end loader dynamically mounts these into the Handlebars/React SSR application. Slots allow plugins to inject UI fragments into predefined areas such as navbar, sidebar, or settings.

## 6. Migrations and Databases

Each plugin can ship its own Prisma schema and migrations directory. Migrations are applied per plugin, per tenant (if multi-tenancy enabled). The core migration runner maintains a migration registry table to ensure order and idempotency.

## 7. Security Model

- Plugins execute in isolated sandbox or worker contexts.
- Only whitelisted SDK APIs are available.
- Direct fs or network access is prohibited; storage and fetch go through provided service facades.
- Plugin manifests can be signed or verified against an allow-list.
- Capability declarations must match a known prefix (e.g., papertrail.\*).
- Access checks enforced via caps.require() in backend routes.

## 8. Versioning and Compatibility

- The manifest’s `sovereign.api` and `sovereign.engine` define compatibility.
- Deprecated fields remain supported for one minor version before removal.
- Plugins should use semantic versioning and increment minor when changing interfaces.

## 9. CLI Integration

The CLI uses manifest metadata for management commands:

```
sv plugins:list
sv plugins:enable
sv plugins:disable
sv migrate:deploy –plugin
sv plugin:info
```

## 10. Error Handling and Logging

Each plugin receives a scoped logger instance with context `{ pluginId, tenantId }`.

Fatal errors during registration or migration disable the plugin and log diagnostics without halting the platform.
