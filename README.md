# Sovereign — reclaim your digital freedom.

Sovereign is a privacy-first, open-source collaboration and productivity suite that empowers individuals and organizations to take control of their digital lives. By providing a decentralized and federated platform, Sovereign will enables users to manage their data, communicate securely, and collaborate effectively while prioritizing privacy and self-determination.

> The platform is still in its early stages of development.  
> While the plan has been mapped out, the documentation remains incomplete and is actively being developed.

## Getting Started

We use [Node.js](https://nodejs.org/) and [Express](https://expressjs.com/) with the [Handlebars](https://handlebarsjs.com/) template engine as the core stack for this application, with optional [React](https://react.dev/) SSR/JSX support. SQLite serves as the primary database during the MVP stage, with straightforward extensibility to PostgreSQL (or any other SQL database) through [Prisma](https://www.prisma.io/) as an intermediate abstraction layer between the app code and the database.

Please refer [Sovereign Wiki](https://github.com/CommonsEngine/Sovereign/wiki) (WIP) for extended (evolving) documentation.

### Modular Architecture (Core + Plugins)

Sovereign is built as a **modular platform**. The core app provides the runtime (Express, Handlebars/React SSR, RBAC, settings, storage, CLI, and build system). Feature domains live in **plugins** that can be added, enabled/disabled, versioned, and shipped independently from the core.

**Goals**

- Minimize core surface area; keep features in plugins
- Enable safe iteration: plugin versioning + engine compatibility
- Support both server-rendered Handlebars and React SSR views
- Keep deploys simple: one app artifact with opt‑in plugins

**High‑level runtime**

1. **Bootstrap**: core loads config, DB, logger, view engines, and scans `src/plugins/*` for registered plugins.
2. **Manifest phase**: each plugin’s `plugin.json` is validated (namespace, version, engine compatibility, entry points, declared routes/capabilities).
3. **Wiring**: core mounts plugin **routes** (web/api), registers **handlers**, exposes **public assets**, and loads **views**.
4. **RBAC merge**: plugin‑declared capabilities are merged into the global graph (no runtime DB migration required for read‑time checks). (TBA)
5. **Lifecycle hooks** (optional): install/enable/disable/upgrade hooks can prepare data, run migrations, or seed settings. (TBA)

#### Directory Layout

Each plugin sits under `src/plugins/<namespace>` with a predictable layout. Example based on the uploaded screenshot:

```
src/
  plugins/
    blog/
      handlers/        # business logic (service layer)
      public/          # static assets served under /plugins/<ns>/...
      routes/          # Express route modules (web + api)
      views/           # Handlebars or React SSR views
      index.mjs        # plugin entry (exports attach(server) or factory)
      plugin.json      # manifest (see below)
    papertrail/
```

> During build, **all files are copied to `dist/plugins/*` with their original extensions**, while code files are **transpiled in place**. This preserves the structure expected by the runtime and avoids `*.json.json` / `*.html.html` or `.mjs -> .js` skew.

#### Build & Load Rules

- **Assets** (`.html`, `.json`, `.css`, images, etc.) are copied byte‑for‑byte.
- **Code** files (`.ts`, `.tsx`, `.jsx`, `.js`, `.mjs`, `.cjs`) are transpiled but **keep their original extensions**.
- Core resolves `$` imports to `src/`.
- On startup, the server only mounts **enabled** plugins (see `isEnabled`).

### Plugin Architecture

A plugin is defined by a `plugin.json` manifest with the `index.mjs` entry. The manifest declares compatibility, routes, and capabilities; the entry file wires handlers/routes when the plugin is enabled. Lifecycle hooks to be added in the future.

#### `plugin.json` (reference)

Below is the sample manifest used for the **Blog** plugin; field comments explain how the core interprets them.

```jsonc
{
  "namespace": "blog", // unique short id used for routing + RBAC keys
  "name": "@sovereign/blog", // display + NPM-like naming convention
  "version": "1.0.0-alpha.7", // semver of the plugin itself
  "schemaVersion": 1, // manifest schema version (platform-side decoder)
  "preRelease": true, // whether the plugin is flagged experimental
  "isEnabled": true, // default enablement (can be toggled at runtime)
  "description": "Sovereign Blog",
  "main": "./index.mjs", // optional runtime entry for imperative wiring
  "author": "Sovereign Core Team",
  "license": "AGPL-3.0",

  "sovereign": {
    "engine": "0.5.0", // minimum/target core engine version compatibility
    "entryPoints": ["launcher"], // named entry points if the plugin exposes launchers. i.e: launcher | sidebar
  },

  "routes": {
    "web": true, // mount web routes under /plugins/blog (or custom base)
    "api": true, // mount API routes under /api/plugins/blog
  },

  "platformCapabilities": {
    "database": true, // requires DB access (Prisma)
    "gitManager": true, // requires Git manager integration
    "fs": true, // requires filesystem access to workspace
  },

  "userCapabilities": [
    // RBAC: capabilities added by this plugin
    {
      "key": "user:plugin.blog.feature",
      "description": "Enable Blog plugin.",
      "roles": ["platform:user"],
    },
    {
      "key": "user:plugin.blog.create",
      "description": "Create blog project, and configure.",
      "roles": ["platform:user"],
    },
    {
      "key": "user:plugin.blog.read",
      "description": "View own blog project.",
      "roles": [
        "project:admin",
        "project:editor",
        "project:contributor",
        "project:viewer",
        "project:guest",
      ],
    },
    // …additional granular post.* capabilities elided for brevity…
  ],

  "events": {}, // (reserved) event contracts the plugin can emit/consume
  "prisma": {}, // (reserved) plugin-owned Prisma schema modules
  "config": { "FT_PLUGIN_BLOG": true }, // default config/feature flags injected at init (note: might be removed later)
}
```

_Source: sample `plugin.json` shipped with the repo._

#### Entry file (`index.mjs`)

A conventional entry exposes a function the core calls with the app context. Minimal example:

```js
// src/plugins/blog/index.mjs
/**
 * Plugin: Route registry
 * ----------------------
 * Exposes the plugin's Express routers to the Sovereign extension host.
 * - web: non-API routes (e.g., SSR pages)
 * - api: REST or GraphQL endpoints for plugin data operations
 *
 * The extension host mounts these under a plugin-specific base path,
 * e.g., `/api/<plugin-namespace>` for API and `/<plugin-namespace>` for web.
 *
 * This object should remain declarative and side-effect free.
 */
export const routes = { web: webRoutes, api: apiRoutes };

/**
 * render
 * ------
 * Handles server-rendered index view for the plugin (if applicable).
 *
 * Typical Flow
 * 1) Resolve and authorize request context
 * 2) Prepare or fetch data relevant to the view
 * 3) Render a Handlebars or React SSR template with that data
 *
 * Parameters
 * - _: (reserved for dependency injection; receives context in future)
 * - resolve(fn): wrapper that produces an Express route handler
 *
 * Returns
 * - Express handler that renders a view or error template.
 *
 * Notes
 * - This is optional; plugins without UI can omit it.
 * - Avoid leaking secrets or raw config into templates.
 */
export async function render(_, resolve) {
  return resolve(async (req, res) => {
    // render logic goes here
  });
}
```

#### Routing conventions

- Web routes mount under `/plugins/<namespace>` by default; APIs under `/api/plugins/<namespace>`.
- A plugin can customize its base mount path from the entry file. (TBA later)
- Views can be Handlebars **or** React SSR. Client hydration is supported via sibling `.client.jsx` files when Vite is active in dev.

#### RBAC & Capabilities

- Plugins **declare** capabilities in `plugin.json`; these are merged into the global RBAC graph at boot. (TBA)
- At request time, middleware exposes `req.can('user:plugin.blog.post.create')` / `res.locals.capabilities` for templates.
- For idempotent imports or repeated enabling, capabilities are upserted.

#### Versioning & Compatibility

- Core checks `manifest.sovereign.engine` against the running engine version. Incompatible plugins are skipped with a warning.
- Use semver for plugin `version`; core can surface upgrade prompts when a newer compatible version is present.

#### CLI (v0.1.0) — managing plugins

```
sv plugins add <spec>                     # path | git URL | npm name
sv plugins list [--json] [--enabled|--disabled]
sv plugins enable <namespace>
sv plugins disable <namespace>
sv plugins remove <namespace>
sv plugins show <namespace> [--json]
sv plugins validate <path>
```

> CLI tool is under development and not operational at the moment.

#### Notes for Contributors

- Keep plugin code **pure** and **self‑contained**. Cross‑plugin calls should go via explicit APIs or events.
- Put shared utilities in `src/platform` or `src/services`; do not reach into another plugin’s internals.
- Keep manifests small: name/namespace/version, route toggles, capabilities, and minimal config. Heavy logic lives in code.

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
app.get("/example/react/*", requireAuth, exposeGlobals, async (req, res, next) => {
  try {
    await res.renderJSX("example/react/index", {
      path: req.params[0] || "",
    });
  } catch (err) {
    next(err);
  }
});
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

hydrateRoot(document.getElementById("app"), <ReactApp {...window.__SSR_PROPS__} />);
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
import logger from "../../services/logger.mjs";
```

use:

```js
import logger from "$/services/logger.mjs";
```

The alias works for app code, tests, and development scripts (configured via a custom loader in `scripts/alias-loader.mjs`).

#### Key implementation notes

- AppSetting.value is a JSON column — it accepts objects, arrays, primitives and strings. Plain strings are stored as JSON strings.
- Feature flags: any env var prefixed with `FT_` will be included in `feature.flags` by the seed script (unless `ALLOWED_FEATURES` whitelist is set).
- User/email creation in seed and registration flows:
  - User created first (without primaryEmailId)
  - UserEmail created and linked with `userId`
  - User updated with `primaryEmailId` referencing created email
- Email delivery: configure `EMAIL_SMTP_URL` or `EMAIL_SMTP_HOST`/`EMAIL_SMTP_PORT` with credentials plus `EMAIL_FROM_*` env vars; toggle the `feature.email.delivery.bypass` app setting (or `EMAIL_DELIVERY_BYPASS` env var) to disable outbound email while keeping logs for development.
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
  -p 5000:5000 \
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
     -p 5000:5000 \
     -v sovereign-data:/app/data \
     --env-file /opt/sovereign/.env \
     ghcr.io/<org>/<repo>:latest
   ```

4. **Verify** – Check logs (`docker logs -f sovereign`) and health endpoints. Because the data volume is external to the image, the SQLite database persists across deployments.

### Production runtime notes

- Default `DATABASE_URL` points to SQLite under `/app/data`; mount a persistent volume when running in production.
- The entrypoint runs `prisma db push` on startup to sync the schema. Switch to `prisma migrate deploy` once a Postgres DB is introduced.
- Container listens on port `5000`; map it to any host port you prefer (e.g., `-p 5000:5000`) and front with your preferred reverse proxy for TLS/HTTP termination.

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
