# Sovereign — reclaim your digital freedom.

Sovereign is to develop as a privacy-first, open-source collaboration and productivity suite that empowers individuals and organizations to take control of their digital lives. By providing a decentralized and federated platform, Sovereign will enables users to manage their data, communicate securely, and collaborate effectively while prioritizing privacy and self-determination.

## Getting Started

We use Node.js/Express with the Handlebars template engine as the core stack for this application. SQLite serves as the primary database in MVP stage with straightforward extensibility to PostgreSQL (or any other SQL database) through Prisma.

We use [Prisma](https://www.prisma.io/) as intermediate abstraction layer between the app code and the database.

Please refer [Sovereign Wiki](https://github.com/CommonsEngine/Sovereign/wiki) for extended (evolving) documentation.

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
   - Run the migration command to log the change with `yarn prisma migrate dev --name <migration-name-in-snake-case>`

#### Key implementation notes

- AppSetting.value is a JSON column — it accepts objects, arrays, primitives and strings. Plain strings are stored as JSON strings.
- Feature flags: any env var prefixed with `FT_` will be included in `feature.flags` by the seed script (unless `ALLOWED_FEATURES` whitelist is set).
- User/email creation in seed and registration flows:
  - User created first (without primaryEmailId)
  - UserEmail created and linked with `userId`
  - User updated with `primaryEmailId` referencing created email
- Session RBAC snapshot:
  - Sessions may store a server-side `roles` and `capabilities` JSON to avoid repeated RBAC DB queries.
  - If roles/capabilities change, sessions must be invalidated or refreshed; consider versioning or updating session rows on changes. (To be implemented)

#### Troubleshooting

- "table ... does not exist": run migrations (`npx prisma migrate deploy` / `npx prisma migrate dev`) and `npx prisma generate`.
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
> - Do not rebase shared branches (`main`, `develop`).
> - Rebase your local feature branches before opening a PR to keep history linear.
> - Squash merges ensure each feature is a single, clean commit in history.

## Contributing

See [Contributing to CommonsEngine/Sovereign](https://github.com/CommonsEngine/.github/blob/main/CONTRIBUTING.md)

## License

The community version licensed under AGPL-3.0.
