# Realtime WebSocket Hub

Sovereign now exposes a lightweight WebSocket hub so the platform and plugins can push realtime events without bootstrapping a separate service. The implementation lives under `platform/src/ws/server.js` and is mounted automatically when the HTTP server starts.

## Endpoint

- Default path: `/ws` (configurable via `REALTIME_WS_PATH`, e.g. `/realtime`).
- Enabled by default; set `REALTIME_ENABLED=false` in `.env` to disable.
- Connections must include a valid `svg_session` cookie (or whatever `AUTH_SESSION_COOKIE_NAME` is set to). Browser clients that are already authenticated send it automatically; API clients may pass it via the `Cookie` header.

## Message Format

Messages are simple JSON envelopes:

```jsonc
{
  "type": "eventName",
  "payload": {
    /* any JSON */
  },
  "ts": 1731092700000,
}
```

Built-in handlers:

- Client → Server: `{ "type": "ping", "payload": "optional data" }`
- Server → Client: `{ "type": "pong", "payload": { "echo": ... } }`
- Server welcome: `{ "type": "welcome", "payload": { "user": { id, name, roles } } }`

Unknown event types currently respond with an error packet; extend `handleClientMessage` if you need richer server-side routing.

## Sample Client

```ts
const socket = new WebSocket("ws://localhost:3000/ws");

socket.addEventListener("open", () => {
  console.log("connected");
  socket.send(JSON.stringify({ type: "ping", payload: "hi" }));
});

socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  console.log("event", data.type, data.payload);
});
```

## Broadcasting From The Server

Inside the server bootstrap you can access the hub via `services.realtime`:

```js
const server = await createServer(manifest);
await server.start();

server.services.realtime?.broadcast("notification", {
  message: "Hello from Sovereign",
});
```

Helpers:

- `broadcast(type, payload, filterFn?)`
- `publishToUser(userId, type, payload)`
- `size()` – current connected clients
- `close()` – shuts down the hub (automatically invoked on graceful shutdown)

This initial hub keeps scope intentionally small—just enough to experiment with live updates. As needs grow we can extend it with channel subscriptions, plugin-scoped namespaces, or a broker sitting in front of it.
