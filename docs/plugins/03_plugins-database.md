# Plugin Database Architecture

Sovereign supports two database models for plugins: **Shared** (default) and **Dedicated**.

## 1. Shared Database (Default)

In the shared model, your plugin's Prisma schema is composed into the main platform schema. This is the easiest way to get started and allows for seamless relations with core tables (though direct relations are discouraged in favor of loose coupling).

### How it works

1. Place your `extension.prisma` in `plugins/<namespace>/prisma/extension.prisma`.
2. Run `yarn prisma:compose` (or `yarn prepare:db`) to merge it into `platform/prisma/schema.prisma`.
3. The platform manages migrations and the Prisma client.
4. Access the database via the `database` capability (injects the global `prisma` client).

### Configuration

No special configuration needed. Just ensure `plugin.json` does **not** have `sovereign.database.mode` set to `dedicated`.

---

## 2. Dedicated Database

In the dedicated model, your plugin manages its own isolated database. This is useful for complex plugins that need independent scaling, have conflicting schema requirements, or want full control over their migrations.

### How it works

1. Place your `schema.prisma` in `plugins/<namespace>/prisma/schema.prisma`.
2. **Important**: This file must be a complete Prisma schema with its own `datasource` and `generator` blocks.
3. The platform's compose tool will **ignore** this plugin.
4. You must manage migrations and client generation using the `plugin-db-manage` tool.

### Configuration

In your `plugin.json`:

```json
{
  "sovereign": {
    "database": {
      "mode": "dedicated"
    }
  }
}
```

### Management Tool

Use the `tools/plugin-db-manage.mjs` script to manage your dedicated database.

```bash
# Generate Prisma Client
node tools/plugin-db-manage.mjs generate <namespace>

# Run Migrations (Dev)
node tools/plugin-db-manage.mjs migrate <namespace>

# Deploy Migrations (Prod)
node tools/plugin-db-manage.mjs deploy <namespace>

# Open Prisma Studio
node tools/plugin-db-manage.mjs studio <namespace>
```

### Accessing the Database

Since your tables are not in the global Prisma client, you cannot use the `database` capability to access your own data. Instead, you should import your generated client directly.

```javascript
// In your plugin code
import { PrismaClient } from "@prisma/client"; // Note: This might need to be an alias or specific path depending on generation output
// OR if you generated to a custom location:
// import { PrismaClient } from "./generated/client";

const prisma = new PrismaClient();
```

> **Note**: The `database` capability is still useful if you need read-only access to core tables (like `User` or `Tenant`) from the shared platform database.

## Summary

| Feature         | Shared (Default)             | Dedicated                   |
| :-------------- | :--------------------------- | :-------------------------- |
| **Schema File** | `extension.prisma` (partial) | `schema.prisma` (full)      |
| **Migrations**  | Managed by Platform          | Managed by Plugin           |
| **Client**      | Global `prisma` instance     | Plugin-specific instance    |
| **Isolation**   | Low (Shared tables)          | High (Separate DB possible) |
| **Complexity**  | Low                          | Moderate                    |
