# Model Context Protocol Server

The MCP (`Model Context Protocol`) server keeps a lightweight store of contextual snapshots that can be shared with LLMs or automation agents. It is intentionally small—contexts, metadata, and sessions are serialized to disk so you can restart the process without losing the last trusted state.

## Running the server

```bash
yarn mcp:serve
```

You can also launch it directly so you can tweak CLI flags or env vars:

```bash
node tools/mcp-server/server.mjs --port=4070 --store=data/mcp-server
```

| Flag      | Description                                           |
| --------- | ----------------------------------------------------- |
| `--port`  | Port that the MCP server listens on (default `4050`). |
| `--host`  | Optional hostname binding; defaults to `127.0.0.1`.   |
| `--store` | Relative path where contexts/sessions are persisted.  |

Environment variables (`MCP_PORT`, `MCP_HOST`, `MCP_STORE_DIR`) mirror the CLI flags.

## Storage

The service writes `contexts.json` and `sessions.json` under the configured store directory (default: `data/mcp-server`). Because `/data` is ignored by Git, no runtime data will accidentally be committed.

## API surface

- `GET /mcp/health` → `{ status: "ok", uptime }`
- `GET /mcp/info` → high-level stats (`contexts`, `sessions`, `version`, etc.)
- `GET /mcp/schema` → published schema for contexts/sessions

### Context collection

- `GET /mcp/contexts` accepts query filters (`namespace`, `model`, `tags`, `ids`, `limit`, `offset`, etc.).
- `POST /mcp/contexts` creates or updates a context. JSON body fields: `namespace`, `model`, `metadata`, `tags`, `payload`.
- `GET /mcp/contexts/:id` retrieves a single context.
- `PATCH /mcp/contexts/:id` patches existing metadata/tags/payload.
- `DELETE /mcp/contexts/:id` removes it.

### Session collection

- `GET /mcp/sessions` lists sessions (filter by `contextId`, `model`, `ids`, `limit`, `offset`).
- `POST /mcp/sessions` records a session; body fields: `contextId`, `model`, `tags`, `meta`, optional `contextSnapshot`.
- `GET /mcp/sessions/:id` gets a session record.
- `PATCH /mcp/sessions/:id` updates tags/meta.
- `DELETE /mcp/sessions/:id` deletes it.

Every response is JSON and the server exposes permissive CORS headers so you can consume it from browser tooling or automation agents.
