# Contributing to Sovereign

Thank you for your interest in contributing. This document covers everything
you need to get started.

## Contents

- [Development setup](#development-setup)
- [Branching and commits](#branching-and-commits)
- [Pull requests](#pull-requests)
- [Contributor Licence Agreement](#contributor-licence-agreement)
- [Building a plugin](#building-a-plugin)

---

## Development setup

**Requirements:** Node.js ≥20, pnpm 11.5.2, Git. Docker is optional but
recommended for running the full stack locally.

```bash
git clone https://github.com/CommonsEngine/Sovereign.git
cd Sovereign
pnpm install
cp .env.example .env   # fill in required values
pnpm generate          # builds runtime/generated/ from plugin manifests
pnpm dev               # starts runtime + auth server
```

Open `http://localhost:3000`. The first user to register is automatically
assigned `platform:admin`.

**Environment variables:** `AUTH_SECRET` and `SOVEREIGN_AUTH_SECRET` have no
defaults — the server will not start without them. See `.env.example` for all
required variables.

**Code quality hooks:** The pre-commit hook runs Prettier and ESLint on staged
files automatically. Run `pnpm format` and `pnpm lint` at any time to check
your working tree manually.

---

## Branching and commits

Always branch from an up-to-date `main`:

```bash
git switch main && git pull
git switch -c feat/your-feature-name
```

**Branch prefixes:**

| Prefix   | Use for                                         |
| -------- | ----------------------------------------------- |
| `feat/`  | New features or capabilities                    |
| `fix/`   | Bug fixes                                       |
| `docs/`  | Documentation only                              |
| `chore/` | Tooling, scaffolding, dependencies, maintenance |

**Commit messages** should explain _why_, not just _what_. Keep the subject
line under 72 characters. Body lines wrap at 100 characters.

If you used an AI assistant to help write the code, include the co-author
trailer in your commit:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Pull requests

- **One logical change per PR.** Keep scope tight.
- All checks must pass before review: `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`.
- If your change touches architecture or requirements, cite the relevant SRS
  section in the PR description (e.g. `SRS §3.6`, `PLT-02`).
- Bump the relevant `package.json` version(s) in the same PR where required
  — see the version bump conventions in `CLAUDE.md`.
- PRs are merged with **rebase and merge** — no squash, no merge commits.
- Fix commit messages before the PR is merged; correcting them after means
  rewriting `main`.

---

## Contributor Licence Agreement

Before your first PR can be merged, you must agree to the Sovereign
Contributor Licence Agreement (CLA). The CLA covers both code and
documentation contributions and grants the project the right to distribute
your work under its current and future licences (including commercial use).

**How to sign:** Read this document in full, then tick the CLA checkbox in
the PR template when you open your pull request. That checkbox is your
agreement — no separate form or signature is required at this stage.

---

## Building a plugin

Sovereign's plugin system is the core of the platform. If you want to build
a plugin rather than contribute to the runtime itself:

- See `docs/plugin-development.md` for the full plugin developer guide
  (available from v0.5).
- For the manifest reference and SDK surface, see
  `docs/sovereign-proposal-plan-srs.md` — Section 5 (manifest) and
  Section 3.6 (SDK).
- For design system usage (tokens and components), see
  `docs/design-system.md` (available from v0.3.07).

Third-party plugins may use any licence. They do not require a CLA unless
submitted to the official registry.
