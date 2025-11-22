import http from "node:http";
import { URL } from "node:url";

import { createMcpStore, NotFoundError } from "./data-store.mjs";

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
  }
}

const DEFAULT_PORT = 4050;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
}

function sendJson(res, body, status = 200) {
  const payload = JSON.stringify(body ?? {}, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendEmpty(res, status = 204) {
  res.writeHead(status);
  res.end();
}

async function parseRequestBody(req) {
  if (req.method === "GET" || req.method === "DELETE" || req.method === "OPTIONS") {
    return null;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    // eslint-disable-next-line no-unused-vars
  } catch (err) {
    throw new BadRequestError("Invalid JSON body");
  }
}

function parseListFilters(searchParams) {
  const filters = {};
  if (searchParams.has("namespace")) filters.namespace = searchParams.get("namespace");
  if (searchParams.has("model")) filters.model = searchParams.get("model");
  if (searchParams.has("contextId")) filters.contextId = searchParams.get("contextId");
  if (searchParams.has("tags")) {
    const tags = searchParams
      .get("tags")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (tags.length) filters.tags = tags;
  }
  if (searchParams.has("ids")) {
    const ids = searchParams
      .get("ids")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (ids.length) filters.ids = ids;
  }
  if (searchParams.has("updatedAfter")) {
    filters.updatedAfter = searchParams.get("updatedAfter");
  }
  if (searchParams.has("updatedBefore")) {
    filters.updatedBefore = searchParams.get("updatedBefore");
  }
  return filters;
}

function applyPaging(items, searchParams) {
  let data = items;
  if (searchParams.has("offset")) {
    const offset = Number(searchParams.get("offset"));
    if (Number.isFinite(offset) && offset >= 0) data = data.slice(offset);
  }
  if (searchParams.has("limit")) {
    const limit = Number(searchParams.get("limit"));
    if (Number.isFinite(limit) && limit >= 0) data = data.slice(0, limit);
  }
  return data;
}

export async function createMcpServer(options = {}) {
  const store = options.store ?? createMcpStore({ storeDir: options.storeDir });
  const port = Number(options.port ?? process.env.MCP_PORT ?? DEFAULT_PORT);
  const host = options.host ?? process.env.MCP_HOST ?? "127.0.0.1";

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);
    const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
    const searchParams = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      .searchParams;

    if (req.method === "OPTIONS") {
      sendEmpty(res, 204);
      return;
    }

    try {
      if (req.method === "GET" && pathname === "/mcp/health") {
        sendJson(res, { status: "ok", uptime: process.uptime() });
        return;
      }

      if (req.method === "GET" && pathname === "/mcp/info") {
        const stats = await store.stats();
        sendJson(res, {
          ...stats,
          version: "0.1.0",
          host,
          port,
          env: process.env.NODE_ENV ?? "development",
        });
        return;
      }

      if (req.method === "GET" && pathname === "/mcp/schema") {
        sendJson(res, {
          context: {
            fields: ["id", "namespace", "model", "metadata", "tags", "payload"],
          },
          session: {
            fields: ["id", "contextId", "model", "tags", "meta", "contextSnapshot"],
          },
        });
        return;
      }

      if (pathname.startsWith("/mcp/contexts")) {
        const contextIdMatch = pathname.match(/^\/mcp\/contexts\/([^/]+)$/);
        if (!contextIdMatch) {
          if (req.method === "GET") {
            const filters = parseListFilters(searchParams);
            const contexts = await store.listContexts(filters);
            sendJson(res, { data: applyPaging(contexts, searchParams) });
            return;
          }
          if (req.method === "POST") {
            const payload = await parseRequestBody(req);
            const context = await store.upsertContext(payload ?? {});
            sendJson(res, context, 201);
            return;
          }
          sendJson(res, { error: "Method not allowed" }, 405);
          return;
        }

        const contextId = decodeURIComponent(contextIdMatch[1]);
        if (req.method === "GET") {
          const context = await store.getContext(contextId);
          sendJson(res, context);
          return;
        }
        if (req.method === "PATCH") {
          const patch = await parseRequestBody(req);
          const updated = await store.upsertContext({
            id: contextId,
            ...(patch && typeof patch === "object" ? patch : {}),
          });
          sendJson(res, updated);
          return;
        }
        if (req.method === "DELETE") {
          await store.deleteContext(contextId);
          sendEmpty(res, 204);
          return;
        }
        sendJson(res, { error: "Method not allowed" }, 405);
        return;
      }

      if (pathname.startsWith("/mcp/sessions")) {
        const sessionIdMatch = pathname.match(/^\/mcp\/sessions\/([^/]+)$/);
        if (!sessionIdMatch) {
          if (req.method === "GET") {
            const filters = parseListFilters(searchParams);
            const sessions = await store.listSessions(filters);
            sendJson(res, { data: applyPaging(sessions, searchParams) });
            return;
          }
          if (req.method === "POST") {
            const payload = await parseRequestBody(req);
            const session = await store.createSession(payload ?? {});
            sendJson(res, session, 201);
            return;
          }
          sendJson(res, { error: "Method not allowed" }, 405);
          return;
        }

        const sessionId = decodeURIComponent(sessionIdMatch[1]);
        if (req.method === "GET") {
          const session = await store.getSession(sessionId);
          sendJson(res, session);
          return;
        }
        if (req.method === "PATCH") {
          const patch = await parseRequestBody(req);
          const updated = await store.updateSession(sessionId, patch ?? {});
          sendJson(res, updated);
          return;
        }
        if (req.method === "DELETE") {
          await store.deleteSession(sessionId);
          sendEmpty(res, 204);
          return;
        }
        sendJson(res, { error: "Method not allowed" }, 405);
        return;
      }

      sendJson(res, { error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendJson(res, { error: error.message }, 404);
        return;
      }
      if (error instanceof BadRequestError) {
        sendJson(res, { error: error.message }, 400);
        return;
      }
      console.error("MCP server error", error);
      sendJson(res, { error: "Internal server error" }, 500);
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
