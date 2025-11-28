# GraphQL Server Plan

Purpose: add a first-class GraphQL server alongside existing REST and WebSocket layers while reusing auth, logging, and ops patterns.

## Hosting & Transport

- Serve GraphQL over the existing Express listener at `/graphql` (POST + GET). Keep it on the same port to share middleware, cookies, and logging.
- Gate any landing page/Playground by env (e.g., `GRAPHQL_PLAYGROUND_ENABLED` in non-prod only).
- Subscriptions: prefer `graphql-ws` over the existing WebSocket server path (e.g., `/graphql`) with the same auth handshake; reuse the realtime hub if feasible, otherwise run a dedicated WS endpoint from the same HTTP server.

## Dependencies

- Core: `graphql`.
- HTTP adapter: choose `@apollo/server` + `@apollo/server/express4`, or a lighter stack like `graphql-http`/Helix/Envelop if minimal middleware is preferred.
- Subscriptions: `graphql-ws` for protocol handling.
- Optional lint/validation: `graphql-schema-linter` or `eslint-plugin-graphql` for CI checks.

## Context & Auth

- Reuse existing auth middleware (session/cookie/token parsing) to populate a GraphQL context `{ user, session, tenant, requestId, services }`.
- Apply the same permission checks as REST; return domain-friendly errors, not raw stack traces.
- Propagate `x-request-id` into context and responses to keep observability consistent.

## Schema Scope (Phase 1)

- Scalars: `ID`, `DateTime` (custom), `JSON` if needed.
- Queries: `me`, `projects(first, after)`, `project(id)`; mirror REST read flows.
- Mutations: `login`/`register` (if exposed), `acceptInvite`, `createProject`, `updateProject`, `addProjectMember` (role-aware), `removeProjectMember`.
- Error model: use typed errors via `extensions.code` aligned with REST error codes.
- Deprecations: mark fields slated for removal; document replacement fields.

## Resolvers & Services

- Delegate business logic to existing service layer (same modules backing REST) to avoid duplication.
- Add DataLoader for N+1 hotspots (e.g., project -> members/invites) keyed by project IDs.
- Keep logging around resolver boundaries for slow query tracing; include user + requestId context.

## Subscriptions (Phase 2)

- Topics: project updates (membership/metadata), invite events, and optional auth/session changes.
- Auth: mirror realtime hub auth; validate token on `connection_init`; enforce per-tenant isolation.
- Operational controls: keepalive/idle timeouts, max concurrent subscriptions per connection, and payload size limits.

## Performance & Limits

- Apply query depth/complexity limits and max operation size; consider a timeout per operation.
- Use cursor-based pagination (first/after) as the default pattern.
- Cache/static lookups (feature flags, settings) via in-memory or service-layer caching.

## Observability & Ops

- Metrics: record request/operation duration, error counts by `extensions.code`, subscription lifecycle events.
- Tracing hooks: expose a way to wrap resolvers for APM if enabled.
- Structured logging with requestId, userId, operationName, and complexity metadata.

## Security

- Introspection toggle by env (disable in prod by default, allow in dev/tests).
- Rate limiting: reuse existing middleware; consider a lighter per-op limiter for abusive clients.
- CSRF: prefer POST with same-site cookies; for GET queries, ensure CSRF mitigations (might disable GET in prod).

## Testing

- Unit: schema validation and resolver unit tests against mocked services/DataLoaders.
- Integration: `/graphql` queries/mutations hitting real services; auth-required cases; error shape assertions.
- Subscriptions: WS connect/auth flow, event delivery, disconnect/timeout paths.
- Snapshot schema in CI to detect drift; optionally add lint for breaking changes.

## Rollout

- Feature flag/env to enable the GraphQL handler (and playground) without impacting REST/WS.
- Add docs with example queries/mutations and subscription samples.
- Provide migration guidance for clients (REST → GraphQL) and note parity status.
