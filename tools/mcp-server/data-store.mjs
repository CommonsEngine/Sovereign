import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export class NotFoundError extends Error {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

function normalizeDir(dir) {
  if (!dir) return join(process.cwd(), "data", "mcp-server");
  return resolve(process.cwd(), dir);
}

function jsonCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createMcpStore(options = {}) {
  const storeDir = normalizeDir(options.storeDir ?? process.env.MCP_STORE_DIR);
  const contextsPath = join(storeDir, "contexts.json");
  const sessionsPath = join(storeDir, "sessions.json");

  async function ensureStore() {
    await fs.mkdir(storeDir, { recursive: true });
  }

  async function readFile(path, fallback = []) {
    try {
      const raw = await fs.readFile(path, "utf-8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") return fallback.slice();
      throw err;
    }
  }

  async function writeFile(path, value) {
    await ensureStore();
    await fs.writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
  }

  function applyContextFilters(contexts, filters) {
    const { namespace, model, tags, updatedAfter, updatedBefore, ids } = filters;
    let result = contexts;
    if (namespace) {
      result = result.filter((ctx) => ctx.namespace?.toLowerCase() === namespace.toLowerCase());
    }
    if (model) {
      result = result.filter((ctx) => ctx.model?.toLowerCase() === model.toLowerCase());
    }
    if (tags?.length) {
      result = result.filter((ctx) =>
        tags.every((tag) => ctx.tags?.map((t) => t.toLowerCase()).includes(tag.toLowerCase()))
      );
    }
    if (ids?.length) {
      const idSet = new Set(ids);
      result = result.filter((ctx) => idSet.has(ctx.id));
    }
    if (updatedAfter) {
      result = result.filter((ctx) => ctx.updatedAt >= updatedAfter);
    }
    if (updatedBefore) {
      result = result.filter((ctx) => ctx.updatedAt <= updatedBefore);
    }
    return result;
  }

  return {
    async listContexts(filters = {}) {
      const contexts = await readFile(contextsPath, []);
      return applyContextFilters(contexts, filters);
    },

    async getContext(id) {
      const contexts = await readFile(contextsPath, []);
      const ctx = contexts.find((candidate) => candidate.id === id);
      if (!ctx) throw new NotFoundError("Context", id);
      return ctx;
    },

    async upsertContext(payload) {
      const contexts = await readFile(contextsPath, []);
      const now = new Date().toISOString();
      const incoming = {
        ...jsonCopy(payload),
        id: payload.id || randomUUID(),
      };
      const idx = contexts.findIndex((ctx) => ctx.id === incoming.id);
      if (idx >= 0) {
        const previous = contexts[idx];
        contexts[idx] = {
          ...previous,
          ...incoming,
          metadata: { ...previous.metadata, ...incoming.metadata },
          tags: incoming.tags ?? previous.tags,
          updatedAt: now,
        };
      } else {
        contexts.unshift({
          ...incoming,
          tags: incoming.tags ?? [],
          metadata: incoming.metadata ?? {},
          createdAt: now,
          updatedAt: now,
        });
      }
      await writeFile(contextsPath, contexts);
      return contexts.find((ctx) => ctx.id === incoming.id);
    },

    async deleteContext(id) {
      const contexts = await readFile(contextsPath, []);
      const idx = contexts.findIndex((ctx) => ctx.id === id);
      if (idx === -1) throw new NotFoundError("Context", id);
      contexts.splice(idx, 1);
      await writeFile(contextsPath, contexts);
      return true;
    },

    async listSessions(filters = {}) {
      const sessions = await readFile(sessionsPath, []);
      let result = sessions;
      if (filters.contextId) {
        result = result.filter((s) => s.contextId === filters.contextId);
      }
      if (filters.model) {
        result = result.filter((s) => s.model?.toLowerCase() === filters.model.toLowerCase());
      }
      if (filters.ids?.length) {
        const idSet = new Set(filters.ids);
        result = result.filter((s) => idSet.has(s.id));
      }
      return result;
    },

    async getSession(id) {
      const sessions = await readFile(sessionsPath, []);
      const session = sessions.find((entry) => entry.id === id);
      if (!session) throw new NotFoundError("Session", id);
      return session;
    },

    async createSession(payload) {
      const sessions = await readFile(sessionsPath, []);
      const contexts = await readFile(contextsPath, []);
      const now = new Date().toISOString();
      const session = {
        id: payload.id || randomUUID(),
        contextId: payload.contextId ?? null,
        model: payload.model ?? "generic",
        tags: payload.tags ?? [],
        meta: payload.meta ?? {},
        createdAt: now,
        updatedAt: now,
        contextSnapshot:
          payload.contextSnapshot ??
          jsonCopy(contexts.find((ctx) => ctx.id === payload.contextId)) ??
          null,
      };
      sessions.unshift(session);
      await writeFile(sessionsPath, sessions);
      return session;
    },

    async updateSession(id, patch) {
      const sessions = await readFile(sessionsPath, []);
      const idx = sessions.findIndex((entry) => entry.id === id);
      if (idx === -1) throw new NotFoundError("Session", id);
      const now = new Date().toISOString();
      const existing = sessions[idx];
      sessions[idx] = {
        ...existing,
        ...jsonCopy(patch),
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      await writeFile(sessionsPath, sessions);
      return sessions[idx];
    },

    async deleteSession(id) {
      const sessions = await readFile(sessionsPath, []);
      const idx = sessions.findIndex((entry) => entry.id === id);
      if (idx === -1) throw new NotFoundError("Session", id);
      sessions.splice(idx, 1);
      await writeFile(sessionsPath, sessions);
      return true;
    },

    async stats() {
      const contexts = await readFile(contextsPath, []);
      const sessions = await readFile(sessionsPath, []);
      return {
        contexts: contexts.length,
        sessions: sessions.length,
        lastUpdated: new Date().toISOString(),
      };
    },
  };
}
