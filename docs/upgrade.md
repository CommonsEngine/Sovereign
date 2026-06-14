# Upgrade guide

Migration notes for breaking changes. Per NFR-04, any breaking change to a
published package (`@sovereignfs/sdk`, `@sovereignfs/ui`) ships with at least a
minor version bump and an entry here.

## `@sovereignfs/sdk` 0.6.0 → 0.7.0

### `sdk.db.getClient()` is now implemented and async

`sdk.db.getClient()` previously threw `NotImplementedError` (the runtime had not
wired it). It now returns the platform's Drizzle client. For the same
dialect-agnostic reason as `getConfig()` (node-postgres has no synchronous API),
it returns a `Promise` — `getClient(): Promise<DrizzleClient>`.

**Before:**

```ts
const db = sdk.db.getClient(); // threw NotImplementedError
```

**After:**

```ts
const db = await sdk.db.getClient();
// query your plugin's slug-prefixed tables, e.g. db.select().from(tasksLists)
```

The caller must be in an async context (server components, route handlers, and
server actions all qualify).

## `@sovereignfs/sdk` 0.5.0 → 0.6.0

### `sdk.platform.getConfig()` is now async

To make the platform database **dialect-agnostic** (SQLite and Postgres — Task
0.5.03), the platform data layer can no longer assume synchronous queries:
node-postgres has no synchronous API. `sdk.platform.getConfig()` therefore now
returns a `Promise<PlatformConfig>` instead of `PlatformConfig`.

**Before:**

```ts
const config = sdk.platform.getConfig();
console.log(config.tenantName);
```

**After:**

```ts
const config = await sdk.platform.getConfig();
console.log(config.tenantName);
```

The caller must be in an async context (server components, route handlers, and
server actions all qualify). The returned `PlatformConfig` shape is unchanged.
