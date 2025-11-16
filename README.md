# Sovereign — reclaim your digital freedom.

Sovereign is a privacy-first, open-source collaboration and productivity suite / launchpad that empowers individuals and organizations to take control of their digital lives by taking ownership of their data. By providing a decentralized and federated platform, Sovereign will enables users to manage their data, communicate securely, and collaborate effectively while prioritizing privacy and self-determination.

> The platform is still in its early stages of development.  
> While the plan has been mapped out, features, documentations remains incomplete and is actively being developed.

## Quick Links

- [Manifesto](MANIFESTO.md)
- [Architecture overview](docs/architecture.md)
- [Plugins Architecture](docs/plugins/00_plugins-architecture.md)
- [CLI reference](docs/CLI.md)
- [Contributor License Agreement](docs/legal/Contributor-License-Agreement.md)

## Getting Started

### Architecture & Plugins

We use [Node.js](https://nodejs.org/) and [Express](https://expressjs.com/) with the [Handlebars](https://handlebarsjs.com/) template engine as the core stack for this application, with optional [React](https://react.dev/) SSR/JSX support. SQLite serves as the primary database during the MVP stage, with straightforward extensibility to PostgreSQL (or any other SQL database) through [Prisma](https://www.prisma.io/) as an intermediate abstraction layer between the app code and the database.

The planned plugin architecture is designed to be technology-agnostic, allowing developers to build plugins using frameworks beyond those used in the core stack. Currently, Sovereign supports dynamic web apps built with Express and single-page applications powered by [Vite](https://vite.dev/), with plans to expand to additional frameworks and environments in the future.

We will ship mobile ready, a mobile-ready progressive web app (PWA) with v1.0.0, and we have a plan to offer mobile apps for all major platforms later in the roadmap. These mobile apps will be compatible with any federated instance of Sovereign—and even multiple instances simultaneously—to provide maximum convenience and flexibility.

End-to-end encryption may not be fully implemented in v1.0.0, but it remains a top-priority feature on the roadmap.

Sovereign Core is a **lean core runtime** with the support for **extended plugins** architecure. The core provides a platform for user & access management, tools to interact with varisus tools and services, build tools and built-in CI/CD pipiline. Core APIs to intergrate plugins, third-party services. Also, works as a launchpad for plugins.

We have two kinds of plugins based on the behavior. We have project plugins which support for spawns multiple instance of the plugin as needed (Eg. Blog, PaperTrail). The module plugins can be treated as seperate apps/extensions (Eg. Tasks, Splitify).

- Plugins can be React SPA (planning to support for other frameworks in future) or custom server-driven (JS) modules.
- Each has its own assets, Prisma extensions, and lifecycle hooks.
- A shared CSS token system (`platform/src/public/css/sv_base.css`) keeps styling consistent across plugins, with optional dark mode. We are planning to develop Sovereign Design System as a seperate library later.

For a system-level overview, read [`docs/architecture.md`](docs/architecture.md).

### `sv` Command-line Toolkit

The `sv` command-line interface manages the palform tasks, plugins, database migrations, and manifest generation for a Sovereign workspace. It is meant to run from the repository root (or via `yarn sv`, `pnpm sv`, etc.).

See [`docs/CLI.md`](docs/CLI.md) for detailed command usage, global flags, and scaffolding flows.

### Development

#### Prerequisites

- macOS or Linux
- Node.js (v18+ recommended, v22.20.0+ for development)
- Yarn
- Configured the local workstation to push signed (via SSH/GPG) commits to GitHub.

#### Notes for Contributors

- Keep plugin code **pure** and **self‑contained**. Cross‑plugin calls should go via explicit APIs or events.
- If you need extended core pfunctionlity, create a issue before creating the PR.
- Read [Contributor License Agreement](docs/legal/Contributor-License-Agreement.md) before you start development.

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
   yarn prepare:env
   ```

   - `prepare:env` will prepare the envirement and copies `platform/.env.example` → `platform/.env`.
   - You have to manaully update `.env` with required variables before moving forward,

4. Prepare for the buid

   ```bash
   yarn prepare:all
   ```

   - `prepare:all` will run a few commands to prepare the database and build the initial manifest.
   - It also run `postprepare:all` script after to seed the initial database entries

5. Build the app

   ```bash
   yarn build
   ```

   - `prebuild` script will runs prior to re-generate manifest

6. Run app (example)
   ```bash
   yarn dev // or yarn start
   ```

##### CLI linking (optional): `sv:link` and `postinstall`

If you want a global `sv` command (so you can run `sv …` from anywhere), expose the bin and add a **minimal** linker script. Keep linking **opt‑in** to avoid surprising CI/dev machines.

**package.json (root)**

```jsonc
{
  "bin": { "sv": "./bin/sv.mjs" },
  "scripts": {
    // Register this repo as a global link & make 'sv' available
    "sv:link": "chmod +x bin/sv.mjs && yarn link --silent || true",

    // Optional: auto-link on install when you explicitly opt in
    // Usage: SV_LINK=1 yarn install
    "postinstall": "node -e \"if(process.env.SV_LINK==='1'){try{require('child_process').execSync('yarn sv:link',{stdio:'inherit'})}catch(e){process.exit(0)}}\"",
  },
}
```

**Usage**

```bash
# one-time: create the global 'sv' link (manual)
yarn sv:link

# or auto-link during install (explicit opt-in)
SV_LINK=1 yarn install
```

> Environment injection for serving is handled by the PM2 ecosystem file (Node 20+ supports `--env-file`). Ensure `PORT` and `DATABASE_URL` are defined there or exported in your shell before running `sv serve`.

##### Serve via CLI (PM2)

Prefer using the **sv** CLI directly instead of adding `serve` scripts to `package.json`.

**Commands**

```bash
sv serve                      # first-run detection → install/init/build/manifest, else fast restart
sv serve rebuild              # rebuild (manifest → build) and (re)start
sv serve delete               # stop and remove PM2 app
```

Flags: `--force`, `--no-health`, `--port <n>`, `--ecosystem <path>` (see [`docs/CLI.md`](docs/CLI.md) → Serve Commands).

##### Local dev domain (unix-based): `sovereign.test`

You can map a friendly local domain to your dev server for a production‑like experience.

**Option A — /etc/hosts (simple)**

1. Edit hosts file:
   ```bash
   sudo nano /etc/hosts
   ```
2. Add the entry:
   ```
   127.0.0.1   sovereign.test
   ```
3. Flush DNS cache:
   ```bash
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   ```
4. Test in your browser: `http://sovereign.test:3000`

**Option B — Reverse proxy (no port, with HTTPS)**

Use a local reverse proxy to avoid typing `:3000` and optionally enable HTTPS.

_Caddy example:_

1. Install Caddy:
   ```bash
   brew install caddy // use brew or any other option
   ```
2. Create a `Caddyfile` in your project root:
   ```
    sovereign.test {
      tls internal
      reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto https
      }
    }
   ```
3. Run Caddy (may require sudo for port 80/443):
   ```bash
   caddy fmt --overwrite ./Caddyfile
   sudo caddy run --config ./Caddyfile
   ```
4. Open: `http://sovereign.test` (or `https://sovereign.test` if TLS is enabled)

> Tip: Keep this setup dev‑only. For production, use your standard reverse proxy (Caddy/Nginx/Traefik) with real domains and certificates.

#### Git Workflow

We follow a [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/) inspired branching strategy to keep development organized and production stable.

**Branches**

- `main` → production branch (always deployable).
- `develop` → integration branch (latest development work).
- `feat/` → short-lived branches for new features or fixes.
- `release/` → optional branches to prepare a release.
- `hotfix/` → urgent fixes branched from main.
- `fix/` → bug fixes branched from develop.
- `chore/` → maintenance and DX tasks (docs, tooling, dependencies, CI), no product changes.
- `improv/` → improvements
- `poc/` → POCs

##### Start a feature

```bash
git switch -c feat/my-feature develop
```

Work, commit, and rebase with develop to stay updated.

##### Open a PR → merge into develop

- Use **Squash & Merge** to keep history clean.

##### Release to production

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

##### Hotfixes

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

See [Developer Guide](doc/developer-guide.md) for detailed information

### Testing

Run the Node.js built-in test runner:

```bash
yarn test
```

Keep tests running in watch mode during development:

```bash
yarn test:watch
```

### Deployment

#### Checklist (code + DB without resets)

- Ensure `NODE_ENV=production` (or your prod env) is set in the deploy environment.
- Keep Prisma schema composed and migrations committed: run `yarn prisma:compose:check` and `yarn prisma:migrate` locally, commit new `prisma/migrations/*`.
- Build artifacts/manifest before deploying: `yarn build` (runs compose/format) and `yarn build:manifest`.
- Apply migrations in prod with history, not `db push`: `NODE_ENV=production prisma migrate deploy --schema platform/prisma/schema.prisma` (or `yarn prisma:deploy`).
- Seed non-destructive metadata after deploy (e.g., plugins/capabilities): `NODE_ENV=production node tools/database-seed-plugins.mjs`.
- If prod was ever created via `db push`, baseline once (after backup): loop `prisma migrate resolve --applied <migration_folder>` over existing migrations, then use `migrate deploy` thereafter.
- For drift investigation (don’t reset): `npx prisma migrate diff --from-url <prod_db_url> --to-schema-datamodel platform/prisma/schema.prisma --script > /tmp/reconcile.sql`; create a corrective migration instead of wiping data.

#### PM2 Setup (non-container)

If you prefer a bare-metal deployment without Docker or anything heavy, can use [`pm2`](https://pm2.keymetrics.io/) config defined in `ecosystem.config.cjs`(ecosystem.config.cjs) to serve the app.

1. Clone the core repository to your server envirement

   ```bash
   git clone git@github.com:CommonsEngine/Sovereign.git sovereign
   cd sovereign
   ```

2. Import any third-party plugins if need

   ```bash
   git clone git@github.com:<org>/<plugin-name>.git pugins/<plugin-name>
   ```

3. Install dependencies, build and prepare the envirement:

   ```bash
   git checkout main
   git pull --ff-only
   corepack enable || true
   corepack prepare yarn@stable --activate || true
   yarn install --frozen-lockfile || yarn install
   yarn prepare:env
   // Update .env
   yarn prepare:all
   yarn build
   yarn prisma migrate deploy
   ```

4. Install PM2 globally (if not already):

   ```bash
   npm install --global pm2 // yarn global add pm2
   ```

5. Start Sovereign with the provided config:

   ```bash
   pm2 start ecosystem.config.cjs --env production
   pm2 status
   ```

6. Make the process restart on boot:

   ```bash
   pm2 save
   pm2 startup
   ```

7. To see ogs
   ```bash
   pm2 logs sovereign
   ```

Environment variables come from your shell or an external manager (e.g., `/etc/profile`, systemd, direnv). The PM2 config sets `PORT=4000` and `NODE_ENV=production` by default; override those with `pm2 start ... --env` or by editing `ecosystem.config.cjs` to suit your infrastructure.

#### Docker Setup

> ⚠️ Docker setup is being revamped to accomodate new architecture changes.

A multi-stage `Dockerfile` is provided to build and run Sovereign from a container. The image bundles the production build and Prisma client; SQLite data is stored under `/app/data`.

##### Build & run locally

```bash
docker build -t sovereign:local .
docker rm -f sovereign 2>/dev/null || true
mkdir -p ./data
# run with mounted volume for sqlite persistence
docker run --rm \
  -p 4000:4000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  sovereign:local
docker logs -f sovereign
```

##### Publish to GHCR

Either you can directoy push to `ghcr` or you can simply tag version from the `main` branch, and it will automatically picked up by GitHub Actions and publish to `ghcr`.

**Direct Publishing**

```bash
docker build -t ghcr.io/<org>/<repo>:latest .
docker push ghcr.io/<org>/<repo>:latest
```

Ensure you are logged in (`docker login ghcr.io`) with a PAT that has `write:packages` scope.

**Publish via a release**

See [Managing releases in a repository](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## Contributing

See [Contributing to CommonsEngine/Sovereign](https://github.com/CommonsEngine/.github/blob/main/CONTRIBUTING.md).

Contributors must sign the [Sovereign Contributor License Agreement](docs/legal/Contributor-License-Agreement.md) before we can merge pull requests.

## License

Sovereign Core (repository root and `platform/`) is distributed under AGPL-3.0; [`CommonsEngine`](https://github.com/CommonsEngine) may also offer commercial dual licenses for individuals/organizations that need to operate the Core privately; email `mailtokasun[at]gmail.com` for details. Plugins may declare their own licenses (e.g., MIT, AGPL-3.0, proprietary) provided they comply with the Sovereign Terms of Service and clearly ship a `LICENSE` file in the plugin directory.
