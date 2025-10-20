# Sovereign — reclaim your digital freedom.

Sovereign is a privacy-first, open-source collaboration and productivity suite that empowers individuals and organizations to take control of their digital lives. By providing a decentralized and federated platform, Sovereign will enables users to manage their data, communicate securely, and collaborate effectively while prioritizing privacy and self-determination.

The platform is still in its early stages of development. While the plan has been mapped out, the documentation remains incomplete and is actively being developed.

## Getting Started

We use [Node.js](https://nodejs.org/) and [Express](https://expressjs.com/) with the [Handlebars](https://handlebarsjs.com/) template engine as the core stack for this application, with optional [React](https://react.dev/) SSR/JSX support. SQLite serves as the primary database during the MVP stage, with straightforward extensibility to PostgreSQL (or any other SQL database) through [Prisma](https://www.prisma.io/), as an intermediate abstraction layer between the app code and the database.

Please refer [Sovereign Wiki](https://github.com/CommonsEngine/Sovereign/wiki) (WIP) for extended (evolving) documentation.

### Development

#### Prerequisites

- macOS or Linux
- Node.js (v18+ recommended, v22.20.0+ for development)
- Yarn
- Configured the local workstation to push signed (via SSH/GPG) commits to GitHub.

#### Quickstart (development, unix-based)

1. Clone repo

   ```bash
   git clone git@github.com:CommonsEngine/Sovereign.git
   cd Sovereign
   ```

2. Install

   ```bash
   yarn install // or yarn
   ```

3. Configure environment

   ```bash
   yarn init:prepare
   ```

   - `init:prepare` script will copy `.env.example` → `.env`
   - Update `.env` with required variables

4. Generate Prisma client and apply migrations

   ```bash
   yarn prisma db push
   ```

5. Seed DB

   ```bash
   yarn init:start
   ```

   - `init:start` script will reset prisma, and the codebase if alreay configured, and run the seed script (`yarn prisma:seed`) after.
   - By default seed scripts will add App Settings, [RBAC](<https://github.com/CommonsEngine/Sovereign/wiki/1.1.-Role%E2%80%90Based-Access-Control-(RBAC)-Architecture>) data.

6. Run app (example)
   ```bash
   yarn dev // or yarn start
   ```

Use `yarn dev` to launch the development server with automatic file watching. For the production build, use `yarn start`.

7. Updating Prisma schema and apply migrations
   - Update `prisma/schema.prisma` first
   - Run `yarn prisma validate` and `yarn prisma format` to ensure the validity and format the schema changes
   - Run the migration command to log the change with `yarn prisma migrate dev --name <migration_name_in_snake_case>`

#### React / JSX Support (Server-Side Rendering + Client Hydration)

The Sovereign Express/Handlebars stack also supports for **React / JSX views** (alonegside Handlebars) rendered via **server-side rendering (SSR)** with optional **client-side hydration** using [Vite](https://vite.dev/) middleware.

This hybrid setup allows you to:

- Keep using Handlebars for static pages, layouts, and emails.
- Add React components or entire pages where interactivity or component reuse is needed.
- Render React SSR directly from Express routes using `res.renderJSX()`.

##### How It Works

A custom Express helper/middleware, `res.renderJSX(viewPath, props)`, is available to render React components server-side:

- It automatically resolves the module under `/src/views/${viewPath}.{jsx,tsx,ts,js}`.
- Uses React's SSR API to generate HTML and embed initial props.
- Automatically injects a matching client bundle (e.g. `.client.jsx`) for hydration during development.

##### Creating a JSX Route

Example route (from `src/index.mjs`):

```js
app.get(
  "/example/react/*",
  requireAuth,
  exposeGlobals,
  async (req, res, next) => {
    try {
      await res.renderJSX("example/react/index", {
        path: req.params[0] || "",
      });
    } catch (err) {
      next(err);
    }
  },
);
```

The above renders the React component from `src/views/example/react/index.jsx`.

##### Creating a React / JSX View

Example file: `src/views/example/react/index.jsx`

```jsx
import React from "react";
import { Routes, Route, useParams, StaticRouter } from "react-router";
import { BrowserRouter, Link } from "react-router-dom";

function IndexPage() {
  return (
    <section>
      <h2>Index Page (React App)</h2>
      <p>
        <Link to="/page/123">Go to Page 123</Link>
      </p>
    </section>
  );
}

function PageById() {
  const { id } = useParams();
  return (
    <section>
      <h2>Page {id}</h2>
      <p>Welcome!</p>
    </section>
  );
}

export default function ReactApp({ url }) {
  const basename = "/example/react";
  const isServer = typeof window === "undefined";

  const content = (
    <>
      <header>
        <h1>React App</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Index Page</Link>
          <Link to="/page/123">Page 123</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/page/:id" element={<PageById />} />
      </Routes>
    </>
  );

  return isServer ? (
    <StaticRouter location={url} basename={basename}>
      {content}
    </StaticRouter>
  ) : (
    <BrowserRouter basename={basename}>{content}</BrowserRouter>
  );
}
```

##### Adding Client Hydration (Optional)

To hydrate the JSX page on the client, create a matching `.client.jsx` file in the same folder:

```jsx
// src/views/example/react/index.client.jsx
import React from "react";
import { hydrateRoot } from "react-dom/client";
import ReactApp from "./index.jsx";

hydrateRoot(
  document.getElementById("app"),
  <ReactApp {...window.__SSR_PROPS__} />,
);
```

When running in development (`yarn dev`), Vite automatically loads this client entry to hydrate the SSR HTML.

##### Notes

- JSX/TSX files are stored under `/src/views/`, mirroring the Handlebars template structure.
- In development, Vite runs in middleware mode (with HMR and JSX/TSX support).
- Production builds can extend Vite configuration to include client bundles for hydration.
- React Router v7+ is supported (`StaticRouter` from `react-router`, `BrowserRouter` from `react-router-dom`).
- Handlebars and React can be mixed — e.g., Handlebars layout wrapping a React-rendered `<div id="app">` island.

### Testing

Run the Node.js built-in test runner:

```bash
yarn test
```

Keep tests running in watch mode during development:

```bash
yarn test:watch
```

### Module aliases

The project uses a simple `$` alias that points to the `src/` directory. Instead of long relative paths like:

```js
import logger from "../../utils/logger.mjs";
```

use:

```js
import logger from "$/utils/logger.mjs";
```

The alias works for app code, tests, and development scripts (configured via a custom loader in `scripts/alias-loader.mjs`).

#### Key implementation notes

- AppSetting.value is a JSON column — it accepts objects, arrays, primitives and strings. Plain strings are stored as JSON strings.
- Feature flags: any env var prefixed with `FT_` will be included in `feature.flags` by the seed script (unless `ALLOWED_FEATURES` whitelist is set).
- User/email creation in seed and registration flows:
  - User created first (without primaryEmailId)
  - UserEmail created and linked with `userId`
  - User updated with `primaryEmailId` referencing created email
- Email delivery: configure `SMTP_URL` or `SMTP_HOST`/`SMTP_PORT` with credentials plus `EMAIL_FROM_*` env vars; toggle the `feature.email.delivery.bypass` app setting (or `EMAIL_DELIVERY_BYPASS` env var) to disable outbound email while keeping logs for development.
- Session RBAC snapshot:
  - Sessions may store a server-side `roles` and `capabilities` JSON to avoid repeated RBAC DB queries.
  - If roles/capabilities change, sessions must be invalidated or refreshed; consider versioning or updating session rows on changes. (To be implemented)

#### Troubleshooting

- "table ... does not exist": run migrations (`yarn prisma migrate deploy` / `yarn prisma migrate dev`) and `yarn prisma generate`.
- VersionRegistry increments: seed logic should update VersionRegistry once, not per-config. If values are unexpectedly high, ensure the upsert is executed only once.

#### Git Workflow

We follow a [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/) inspired branching strategy to keep development organized and production stable.

**Branches**

- `main` → production branch (always deployable).
- `develop` → integration branch (latest development work).
- `feat/` → short-lived branches for new features or fixes.
- `release/` → optional branches to prepare a release.
- `hotfix/` → urgent fixes branched from main.
- `fix/` → bug fixes branched from develop.
- `chore/` → maintenance tasks (docs, tooling, dependencies, CI), no product changes.
- `improv/` → improvements

##### Workflow

###### Start a feature

```bash
git switch -c feat/my-feature develop
```

Work, commit, and rebase with develop to stay updated.

###### Open a PR → merge into develop

- Use **Squash & Merge** to keep history clean.

###### Release to production

- When develop is stable:

```bash
git checkout main
git merge --ff-only develop
git push origin main
```

Alternatively:

```bash
git fetch origin
git checkout develop
git pull               # update local develop
git rebase origin/main # replay develop on top of main
# resolve any conflicts, then:
git push --force-with-lease

git checkout main
git merge --ff-only develop
git push
```

- Tag the release:

```bash
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

###### Hotfixes

- Branch from `main`, fix, then merge back into both `main` and `develop`.

> **Notes:**
>
> - Always branch out from `develop`.
> - Do not rebase shared branches (`main`, `develop`).
> - Rebase your local feature branches before opening a PR to keep history linear.
> - Squash merges ensure each feature is a single, clean commit in history.

##### Conventional Commits (recommended)

We encourage following [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages. Short guidelines:

- Format: type(scope?): subject
  - type: `feat` | `fix` | `docs` | `style` | `refactor` | `perf` | `test` | `chore` | `build` | `ci` | `revert`
  - scope: optional, single token describing area (e.g. auth, db, ui)
  - subject: short, imperative, lowercase, no trailing period
- Optional body: blank line then detailed description (wrap ~72 chars)
- Footer: use for `BREAKING CHANGE:` descriptions and issue references (e.g. "Refs: #123")

Examples:

- feat(auth): add invite token verification
- fix(register): validate invite token expiry
- docs(readme): clarify setup steps
- chore(deps): bump prisma to v6
- perf(cache): reduce redundant DB queries
- revert: Revert "feat(x): ..." (when reverting a previous commit)

Breaking change example (footer):

- feat(api): change user payload
- BREAKING CHANGE: "email" field moved from User -> UserEmail; update clients.

<!--
Tooling:

- Use commitlint / husky if you want to enforce messages in CI.
- A "prepare" script can run a commit template or interactive prompt (optional).
-->

## Docker Setup

A multi-stage `Dockerfile` is provided to build and run Sovereign from a container. The image bundles the production build and Prisma client; SQLite data is stored under `/app/data`.

### Build & run locally

```bash
docker build -t sovereign:local .
mkdir -p ./data
# run with mounted volume for sqlite persistence
docker run --rm \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  sovereign:local
```

### Publish to GHCR

```bash
docker build -t ghcr.io/<org>/<repo>:latest .
docker push ghcr.io/<org>/<repo>:latest
```

Ensure you are logged in (`docker login ghcr.io`) with a PAT that has `write:packages` scope.

### Deployment workflow (GHCR → server)

1. **CI/CD push** – On every merge to `main`, build the image and push it to `ghcr.io/<org>/<repo>:<tag>` (e.g., `latest` plus a git SHA tag). GitHub Actions can handle this automatically.
2. **Server pull** – On the target host:
   ```bash
   docker login ghcr.io
   docker pull ghcr.io/<org>/<repo>:latest
   ```
3. **Restart container with persistent volume** – Reuse the same named volume (or host path) for `/app/data` so the SQLite file survives upgrades:

   ```bash
   docker stop sovereign || true
   docker rm sovereign || true

   docker run -d \
     --name sovereign \
     -p 3000:3000 \
     -v sovereign-data:/app/data \
     --env-file /opt/sovereign/.env \
     ghcr.io/<org>/<repo>:latest
   ```

4. **Verify** – Check logs (`docker logs -f sovereign`) and health endpoints. Because the data volume is external to the image, the SQLite database persists across deployments.

### Production runtime notes

- Default `DATABASE_URL` points to SQLite under `/app/data`; mount a persistent volume when running in production.
- The entrypoint runs `prisma db push` on startup to sync the schema. Switch to `prisma migrate deploy` once a Postgres DB is introduced.
- Exposes port `3000`; front with your preferred reverse proxy for TLS/HTTP termination.

## PM2 Setup (non-container)

If you prefer a bare-metal deployment without Docker, a sample `ecosystem.config.cjs` is included for [PM2](https://pm2.keymetrics.io/).

1. Install dependencies and build once:

   ```bash
   yarn install --frozen-lockfile
   yarn build
   yarn prisma db push
   ```

   Repeat the build step (`yarn build`) after every application update so `dist/` stays current.

2. Install PM2 globally (if not already):

   ```bash
   npm install --global pm2
   ```

3. Start Sovereign with the provided config:

   ```bash
   pm2 start ecosystem.config.cjs --env production
   pm2 status
   ```

4. Make the process restart on boot:

   ```bash
   pm2 save
   pm2 startup
   ```

5. For updates:
   ```bash
   git pull
   yarn install --frozen-lockfile
   yarn build
   yarn prisma db push
   pm2 reload sovereign
   ```

Environment variables come from your shell or an external manager (e.g., `/etc/profile`, systemd, direnv). The PM2 config sets `PORT=3000` and `NODE_ENV=production` by default; override those with `pm2 start ... --env` or by editing `ecosystem.config.cjs` to suit your infrastructure.

## Features

### Project sharing

Projects now support collaborative access with explicit membership records. Each project can include multiple **owners**, **editors**, and **viewers**:

- Owners can configure integrations, manage content, and invite or revoke other members.
- Editors can contribute to project content but cannot modify membership.
- Viewers have read-only access.

When registering a new account, any pending email-based project invites are automatically linked to the newly created user.

## Contributing

See [Contributing to CommonsEngine/Sovereign](https://github.com/CommonsEngine/.github/blob/main/CONTRIBUTING.md)

## License

The community version licensed under AGPL-3.0.
