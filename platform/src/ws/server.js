/* eslint-disable import/order */
import { URL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

import env from "$/config/env.js";
import logger from "$/services/logger.js";
import { getSessionWithUser } from "$/utils/auth.js";

const { AUTH_SESSION_COOKIE_NAME, REALTIME_ENABLED = true, REALTIME_WS_PATH = "/ws" } = env();

const HEARTBEAT_INTERVAL_MS = 30_000;

function parseCookies(header = "") {
  return header.split(";").reduce((acc, pair) => {
    const [rawKey, ...rest] = pair.split("=");
    if (!rawKey) return acc;
    const key = rawKey.trim();
    if (!key) return acc;
    const value = rest.join("=").trim();
    acc[key] = value;
    return acc;
  }, {});
}

async function authenticateRequest(req) {
  const cookies = parseCookies(req.headers?.cookie || "");
  const token = cookies[AUTH_SESSION_COOKIE_NAME];
  if (!token) return null;
  const session = await getSessionWithUser(token);
  if (!session?.user) return null;
  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];
  return {
    id: session.userId,
    name: session.user.name,
    roles,
    capabilities: session.user.capabilities || {},
    primaryEmail: session.user.primaryEmail?.email || null,
  };
}

function safeJsonParse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function serializePacket(type, payload) {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

export function createRealtimeHub(httpServer, options = {}) {
  if (!REALTIME_ENABLED) {
    logger.info("[ws] realtime hub disabled via env REALTIME_ENABLED=false");
    return null;
  }

  if (!httpServer) {
    throw new Error("Cannot create realtime hub without an HTTP server instance.");
  }

  const log = options.logger || logger;
  const pathOption = options.path || REALTIME_WS_PATH || "/ws";
  const normalizedPath = pathOption.startsWith("/") ? pathOption : `/${pathOption}`;

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();
  const stats = {
    totalConnections: 0,
  };

  const handleClientMessage = (client, raw) => {
    const data = typeof raw === "string" ? raw : raw.toString();
    const packet = safeJsonParse(data);
    if (!packet) {
      client.ws.send(serializePacket("error", { message: "Invalid JSON payload." }));
      return;
    }

    if (packet.type === "ping") {
      client.ws.send(serializePacket("pong", { echo: packet.payload ?? null }));
      return;
    }

    client.ws.send(serializePacket("error", { message: `Unknown event type "${packet.type}".` }));
  };

  const upgradeHandler = (req, socket, head) => {
    let pathname = null;
    try {
      const fullUrl = new URL(req.url || "/", `http://${req.headers.host}`);
      pathname = fullUrl.pathname;
    } catch {
      pathname = null;
    }

    if (pathname !== normalizedPath) {
      return;
    }

    authenticateRequest(req)
      .then((user) => {
        if (!user) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          const client = { ws, user };
          ws.isAlive = true;
          ws.on("pong", () => {
            ws.isAlive = true;
          });

          clients.add(client);
          stats.totalConnections += 1;
          log.info(`[ws] client connected (${user.id})`);

          ws.send(
            serializePacket("welcome", {
              user: { id: user.id, name: user.name, roles: user.roles },
            })
          );

          ws.on("message", (data) => handleClientMessage(client, data));
          ws.on("close", () => {
            clients.delete(client);
            log.info(`[ws] client disconnected (${user.id})`);
          });
          ws.on("error", (err) => {
            log.warn(`[ws] client error (${user.id})`, err);
          });
        });
        return;
      })
      .catch((err) => {
        log.error("[ws] authentication failed during upgrade", err);
        socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
        socket.destroy();
      });
  };

  httpServer.on("upgrade", upgradeHandler);

  const heartbeatTimer = setInterval(() => {
    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        clients.delete(client);
        continue;
      }
      if (client.ws.isAlive === false) {
        client.ws.terminate();
        clients.delete(client);
        continue;
      }
      client.ws.isAlive = false;
      client.ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  async function close() {
    httpServer.off?.("upgrade", upgradeHandler);
    clearInterval(heartbeatTimer);
    for (const client of clients) {
      try {
        client.ws.terminate();
      } catch {
        // ignore termination errors
      }
    }
    clients.clear();
    await new Promise((resolve) => wss.close(resolve));
  }

  function broadcast(type, payload, filterFn) {
    const packet = serializePacket(type, payload);
    for (const client of clients) {
      if (typeof filterFn === "function" && !filterFn(client.user)) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(packet);
      }
    }
  }

  function publishToUser(userId, type, payload) {
    broadcast(type, payload, (user) => user.id === userId);
  }

  return {
    path: normalizedPath,
    stats,
    size: () => clients.size,
    broadcast,
    publishToUser,
    close,
  };
}

export default createRealtimeHub;
