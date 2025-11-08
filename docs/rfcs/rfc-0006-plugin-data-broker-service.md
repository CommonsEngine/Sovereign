# RFC-0006: Brokered Data Service for Plugin Read/Write Operations

**Status:** Draft  
**Author:** Sovereign Team, Codex (AI assistant)
**Created:** 2025-11-08  
**Target Version:** Sovereign v0.2  
**Tags:** Security, API, Plugins, Data Broker

---

## 1. Problem Statement

Some plugins legitimately need to write to core data (e.g., create tasks, update settings) while we cannot trust them with full database access. Direct database isolation (RFC-0003/0004/0005) still leaves gaps when business rules or validation must run inside the core. We need a higher-level broker that mediates plugin reads/writes through vetted APIs and enforces authorization, validation, and audit logging.

## 2. Goals

- Hide the database completely from plugins; expose only explicit capabilities.
- Centralize validation, authorization, and side effects inside core services.
- Maintain compatibility with both SQLite (dev) and server-grade databases (prod).
- Provide observability for every plugin operation.

## 3. Non-Goals

- Replacing the public Sovereign API for end users; this broker is internal to the plugin host.
- Guaranteeing backwards compatibility for unsupported operations (plugins must opt into stable contracts).

## 4. Proposal

### 4.1 Data Broker Service

- Introduce a `DataBroker` service inside the extension host that exposes a minimal RPC surface (function calls or lightweight REST) for plugins.
- Capabilities are declared in the plugin manifest (e.g., `data:task:create`), and the broker verifies them before executing.
- Broker methods call existing core services or Prisma clients to perform operations.

### 4.2 Contract Design

- Contracts follow a pattern:
  ```ts
  interface TaskBroker {
    listTasks(filter: TaskFilter, ctx: PluginContext): Promise<TaskSummary[]>;
    createTask(input: TaskCreateInput, ctx: PluginContext): Promise<TaskSummary>;
  }
  ```
- Contracts are versioned (e.g., `v1alpha`, `v1`), and plugins specify the version they target.

### 4.3 Execution Flow

1. Plugin invokes `ctx.broker.tasks.createTask(...)`.
2. Broker checks capability + manifest version compatibility.
3. Input is validated (zod) and sanitized.
4. Core service executes the action using the full-privilege Prisma Client.
5. Result is returned; broker logs operation metadata (`pluginId`, `tenantId`, `latency`, `status`).

### 4.4 Transport & Isolation

- Broker APIs are in-process function calls by default for low latency.
- Optionally expose HTTP endpoints if we later host plugins out-of-process (WASM, workers).
- Each plugin runs in a sandbox (worker thread/process) with only the broker proxy object, never a raw DB client.

### 4.5 Observability & Governance

- Emit structured events to the audit log on every broker call.
- Rate-limit and timeout broker calls per plugin to prevent abuse.
- Provide CLI tooling (`sv broker:capabilities`) to list available contracts and plugin registrations.

## 5. Rollout Plan

1. Define the broker interface and wire it into the extension host.
2. Implement the highest priority contracts (e.g., read user profile, create board entries).
3. Update one pilot plugin to consume the broker instead of direct DB access.
4. Expand coverage until all plugins rely exclusively on broker APIs.
5. Remove the database client from plugin sandboxes entirely.

## 6. Security Impact

- **Confidentiality:** Plugins can only request data via vetted contracts that redact sensitive fields.
- **Integrity:** Business rules and validations execute centrally, reducing tampering risk.
- **Availability:** Broker-level rate limits prevent a single plugin from overloading the DB.

## 7. Risks & Mitigations

- **Feature Lag:** Broker must keep up with plugin feature needs. Mitigation: publish a versioned roadmap and accept community proposals.
- **Increased Latency:** Extra hop may add milliseconds; keep broker in-process and cache results when safe.
- **Implementation Effort:** Requires building/maintaining APIs. Mitigation: start with the most sensitive operations and expand iteratively.

## 8. Alternatives

- Database-level controls only (RFC-0003/0004/0005) – good defense-in-depth but insufficient for business-rule enforcement.
- Full GraphQL/REST public API for plugins – heavier surface area and less controlled than a curated broker.

## 9. Open Questions

1. How do we deprecate broker contracts without breaking plugins? (Proposal: semantic versioning + compatibility shims.)
2. Should broker calls be fully asynchronous (message bus) to isolate failures?
3. Can we auto-generate broker clients from OpenAPI/TS interfaces for plugin authors?
