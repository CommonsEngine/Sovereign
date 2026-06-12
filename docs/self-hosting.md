# Self-hosting Sovereign

Sovereign is designed to run on a single machine. Docker Compose is the
canonical deployment path — two containers (runtime + auth) on a shared
internal network, with the runtime exposed as the single public entry point.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (v2.20+)
- A domain name (or `localhost` for local-only use)
- An SMTP provider for email (optional — email is off by default)

---

## Quick start (local machine)

```bash
# 1. Clone
git clone https://github.com/CommonsEngine/Sovereign.git
cd Sovereign

# 2. Configure environment
cp .env.example .env
```

Open `.env` and set at minimum:

```env
# Required — generate a secret with: openssl rand -base64 32
AUTH_SECRET=your-secret-here

# The public URL users hit in their browser (no trailing slash)
NEXT_PUBLIC_RUNTIME_URL=http://localhost:3000
```

```bash
# 3. Start
docker compose up --build
```

The runtime is now at **http://localhost:3000**.

Open it in your browser — the first user to register automatically becomes the
platform admin. If `AUTH_INVITE_ONLY=true`, skip ahead to the
[invite-only](#invite-only-registration) section.

---

## Service topology

```
Browser → localhost:3000 (runtime)
                │
                └─ internal network ──► auth:3001  (auth server)
                                   ──► mailpit:1025 (dev email, SMTP)
```

The **auth server is not mapped to a host port** — it is only reachable on the
internal Docker network. The runtime is the single public entry point. In
production, place a reverse proxy (nginx, Caddy, Traefik) in front of the
runtime container.

---

## Environment variables

All variables live in a single `.env` at the repo root. Copy `.env.example`
to get started — every variable is documented there.

| Variable                  | Required | Default                      | Description                                                                                                                        |
| ------------------------- | -------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`             | **yes**  | —                            | Secret key for the auth server. Generate with `openssl rand -base64 32`. Never share or commit.                                    |
| `SOVEREIGN_ADMIN_KEY`     | **yes**  | —                            | Shared secret for runtime↔auth internal admin API calls (Console user/plugin management). Generate with `openssl rand -base64 32`. |
| `NEXT_PUBLIC_RUNTIME_URL` | **yes**  | `http://localhost:3000`      | Public URL of the runtime — used by the auth server to redirect users after login.                                                 |
| `AUTH_INVITE_ONLY`        | no       | `false`                      | When `true`, registration requires a valid invite token. The first user is exempt.                                                 |
| `AUTH_DATABASE_URL`       | no       | `file:./data/auth.db`        | Auth server database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                      |
| `DATABASE_URL`            | no       | `file:./data/sovereign.db`   | Runtime database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                          |
| `DB_DIALECT`              | no       | `sqlite`                     | Set to `postgres` when using PostgreSQL.                                                                                           |
| `SMTP_HOST`               | no       | —                            | SMTP server host. Leave unset to disable email (the app still runs).                                                               |
| `SMTP_PORT`               | no       | `587`                        | SMTP port.                                                                                                                         |
| `SMTP_USER`               | no       | —                            | SMTP username.                                                                                                                     |
| `SMTP_PASS`               | no       | —                            | SMTP password.                                                                                                                     |
| `SMTP_FROM`               | no       | —                            | Sender address, e.g. `Sovereign <noreply@example.com>`.                                                                            |
| `RUNTIME_PORT`            | no       | `3000` (dev) / `4000` (prod) | Host port the runtime container is mapped to.                                                                                      |
| `SOVEREIGN_AUTH_SECRET`   | no       | —                            | Shared JWT secret for local session verification (v0.5+). Leave unset for now.                                                     |

---

## Data persistence

SQLite databases and uploaded files are stored in the `./data/` directory,
which is mounted as a volume in both the runtime and auth containers:

```
data/
  sovereign.db   # Runtime platform database
  auth.db        # Auth server identity database
  avatars/       # User avatar uploads (Task 0.4.06)
```

Back up the `data/` directory to preserve all application state.

---

## Production deployment

Use `docker-compose.prod.yml` for production. It differs from the dev file in
three ways: the runtime host port defaults to `4000`, both services restart
automatically on failure, and Mailpit is absent (configure real SMTP instead).

```bash
cp .env.example .env
# Edit .env — set AUTH_SECRET, NEXT_PUBLIC_RUNTIME_URL, SMTP_*, etc.

docker compose -f docker-compose.prod.yml up --build -d
```

### Reverse proxy

The auth server is internal-only. To make the login flow work end-to-end from
a browser, you need a reverse proxy that puts the runtime on your domain.
A minimal **Caddy** example:

```
your-domain.com {
    reverse_proxy localhost:4000
}
```

With Caddy in front, the runtime handles all public traffic (including
redirecting to the auth server's login page internally). TLS is handled by
Caddy automatically.

---

## Email in development

The dev Compose file includes [Mailpit](https://mailpit.axllent.org/) — a
local SMTP server with a web inbox. It runs automatically alongside the other
services. No configuration needed:

- **SMTP:** `mailpit:1025` (internal) — already wired in the Compose file
- **Web inbox:** http://localhost:8025

To capture email when using `pnpm dev` (native, outside Docker):

```env
SMTP_HOST=localhost
SMTP_PORT=1025
```

Then start Mailpit separately:

```bash
# Docker (standalone)
docker run -p 1025:1025 -p 8025:8025 axllent/mailpit

# Or native binary — see https://mailpit.axllent.org/docs/install/
```

---

## Invite-only registration

When `AUTH_INVITE_ONLY=true`, only users with a valid invite token can
register. The first user is always exempt — they register normally and become
the platform admin.

After the first user registers, invite new users via the Console:
`/console/users/invite` (Task 0.4.02).

---

## Upgrading

See `docs/upgrade.md` for version-specific migration notes (Task 0.5.06).

The general upgrade process:

```bash
git pull
docker compose up --build -d   # or docker-compose.prod.yml for production
```

Migrations run automatically on startup.
