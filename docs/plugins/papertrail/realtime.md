---
title: "PaperTrail Real-Time Collaboration"
---

# Real-Time Collaboration (Technical Overview)

This document covers the real-time collaboration mechanism added to the PaperTrail plugin. It explains how the server hub and client UI interact over the platform WebSocket server so multiple users can edit a board concurrently.

## Architecture

- **WebSocket server (`platform/src/ws/server.js`)**: The existing `/ws` hub authenticates API sessions via cookies and keeps `projectId → clients` maps. Clients `pt:join` a project to subscribe; when one client sends `pt:update` (after a successful board save), the hub rebroadcasts that snapshot to every other watcher.
- **Project subscriptions**: `projectWatchers` tracks which clients watch which boards so we only send updates to relevant viewers, and `broadcastProjectUpdate` handles the filtered push.
- **Client handshake**: The PaperTrail front-end opens `ws://<host>/ws`, emits `pt:join` (with `projectId`), and queues outgoing updates until the socket is open.

## Client-side flow (`plugins/papertrail/src/Flow.jsx`)

1. **Saver hook**: `createSaver` was extended with an `onSuccess` callback that now triggers `sendRealtimeUpdate`, streaming the latest snapshot over WebSocket immediately after the server confirms persistence.
2. **WebSocket handler**: The client listens for `pt:update` packets and, when a newer version arrives from another client, applies the snapshot directly instead of re-fetching. Incoming updates include a `snapshot` payload plus `sourceId`/`version` so the receiver can skip duplicates and respect the local version.
3. **Safe application**: The Flow component tracks the last-known version in `boardVersionRef` and only applies remote snapshots when they have a greater version number. This avoids overwriting newer local edits with delayed broadcasts.
4. **Resilience**: Updates that fire before the socket opens are queued and flushed once the connection is ready; the client also attempts automatic reconnects to `/ws` every few seconds until the hub accepts the connection.

## Server expectations

- **Message format**
  ```json
  {
    "type": "pt:update",
    "payload": {
      "projectId": "mi6abc...",
      "version": "2025-11-19T18:54:11.799Z:6",
      "sourceId": "client-...",
      "snapshot": {
        "nodes": [...],
        "edges": [...],
        "version": ...
      }
    }
  }
  ```
- **Validation**: The WebSocket server ignores updates without a `projectId`, and clients ignore packets where `sourceId` matches themselves (to avoid echoing their own save).

## Benefits and limitations

- **Instant updates**: Nodes added/edited by one user broadcast to all viewers, enabling collaborative editing with minimal latency.
- **Version safety**: Snapshot version checks stop stale updates from overriding newer boards.
- **Graceful degradation**: If the socket fails, the connection retries and saves still work offline; a manual refresh is still possible via the existing sync logic.

# Next-level improvements

- **Operational transforms/CRDTs**: Introduce diff-aware merging or CRDT-based transforms so edits can be merged without sending full snapshots each time, which would allow finer-grained conflict resolution and reduce bandwidth for large boards.
- **Presence and cursors**: Broadcast metadata about selected nodes or cursor positions so users can see who is editing what, improving awareness in team sessions.
- **Optimistic local queues**: Record pending local edits and reapply them when a remote snapshot lands while the user has unsaved changes, which would prevent remote updates from clobbering in-progress typing.
- **Server-side persistence notifications**: Emit board update events from the server after Prisma transactions complete (rather than relying on the client) so external integrations or audit logs can also react to real-time changes without needing a connected browser.
