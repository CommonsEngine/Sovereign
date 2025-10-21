# RFC: Core Architecture & Extensibility Model

## 1. Vision

*Sovereign* aims to evolve into an **enterprise-grade software platform** built on a simple, modular, and self-sufficient architecture.
The guiding philosophy is *"Simplicity is the ultimate sophistication."*

The platform's foundation must be strong, extendible, and maintainable — without unnecessary dependencies or over-engineering.

## 2. Core Principles

- **Keep the core small.** Only include absolutely necessary subsystems (auth, config, tenancy, routing, storage, logging, extension host).
- **Extensibility first.** Everything beyond the kernel (e.g., blog, boards, forms, docs) should be implemented as independent plugins.
- **Pluggable architecture.** Each plugin is self-contained and interacts with the platform through versioned contracts and SDKs.
- **Replaceable layers.** The system is designed so the Node.js layer could later be replaced (e.g., with Go) without breaking higher layers.
- **Sensible defaults.** Start with SQLite and single-tenant mode, but ensure scalability to Postgres and multi-tenant deployments later.
- **Open-source core.** Anyone can deploy their own “instance”; Sovereign SaaS is simply a managed distribution of the same platform.

## 3. Technology Stack

| Layer             | Current                                                    | Future-Ready For                                  |
|-------------------|------------------------------------------------------------|---------------------------------------------------|
| **Runtime**       | Node.js (ESM `.mjs`)                                       | Golang (optional replacement)                     |
| **Web Framework** | Express.js + Handlebars + React/JSX SSR middleware         | React/Vite standalone web app                     |
| **ORM / DB Layer**| Prisma + SQLite                                            | Prisma + PostgreSQL, multi-DB support             |
| **API Layer**     | REST (core)                                                | Optional GraphQL extension                        |
| **CLI**           | Node-based (`sv` tool)                                     | Manage plugins, migrations, and tenants           |
| **Extensions**    | `/plugins/*` structure                                     | SDK + manifest-based plugin registration          |

## 4. Directory Structure (Root-level)

```
/src
  /core
    /contracts        # Public platform interfaces (events, config, capabilities)
    /services         # Auth, DB, events, config, logging, tenancy
    /middlewares      # Shared express middlewares
    /ext-host         # Plugin loader + sandbox
    /views            # Handlebars views (auth, error pages)
    server.mjs
  /plugins
    /papertrail/
      plugin.json
      api/
      ui/
    /blog/
  bootstrap.mjs        # Entry point; loads kernel + extensions
```

## 5. Data & Multi-DB Strategy

- Core database stores users, sessions, config, and tenant data.
- Each plugin can optionally define its own Prisma schema and maintain its own database connection.
- Use one persistent PrismaClient per DB to avoid memory leaks.
- Multi-tenant support is optional; single-tenant instances are treated as tenant-0.
- Future expansion: per-tenant databases or schemas.

## 6. Extensibility & Plugin Model

- Plugins are self-contained and describe capabilities, routes, events, migrations, and UI slots via a `plugin.json` manifest.
- Core exposes a **plugin SDK** (`@commonsengine/sovereign-sdk`) for backend and UI contributions.
- The extension host loads, validates, and mounts plugin backends at runtime.
- Plugins can define their own Prisma migrations, `REST` endpoints, event handlers, jobs, and UI routes.

## 7. CLI Layer

A lightweight Node CLI (`sv`) will manage platform operations:

- `sv plugins:list|install|enable|disable`
- `sv migrate:deploy [--plugin name]`
- `sv tenant:create|config:get|set`
- `sv dev` (start dev server with live reload)

## 8. Multi-Tenancy & Deployment Model

- Default: Single tenant (`tenant-0`)
- Optional: Multi-tenant extension (per tenant configuration, quotas, and scoping)
- Deployment: Each installation is an instance — either self-hosted or managed (SaaS).
- Isolation: Tenant context middleware ensures DB and config scoping.

## 9. Security & Governance

- Capability-based access control: `can("papertrail.board.write")`
- Secure plugin sandboxing (worker isolation, restricted APIs).
- Signed plugin manifests or allow-lists for trusted sources.
- Graceful shutdown, lifecycle hooks, and consistent audit logging.
