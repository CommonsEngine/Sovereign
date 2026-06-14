# Plainwrite

**Version:** 0.2\
**Date:** June 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign Plainwrite plugin — the single source of truth for its manifest, access model, data model, and build plan.\
**Status:** Draft

---

Plainwrite is a git-backed content editor for static site generators — a
self-hosted alternative to Netlify CMS / Decap CMS. It lets non-technical users
create, edit, and publish Markdown content in git-hosted repositories without
needing to know git. The plugin handles the entire workflow: connecting a repo,
browsing content files, editing with a structured frontmatter form or raw
Markdown, and pushing changes back.

**Design principles:** minimalism and reliability. Plainwrite does not try to
replicate a full headless CMS. It targets the specific, common case: a static
site whose content lives in Markdown files in a git repository, where someone
other than the developer needs to update content.

v0.1 targets GitHub and Astro. The architecture is built around two adapter
interfaces — **git provider** and **SSG** — so that GitLab, Gitea, Jekyll,
Hugo, and others plug in without touching core logic.

The plugin is `type: sovereign` — maintained in a separate external repository
and the primary reference implementation demonstrating credential management and
third-party API integration from within a Sovereign plugin.

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Architecture: provider adapters + DB drafts](#architecture-provider-adapters--db-drafts)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| `id`                               | `io.openfs.sovereign.plainwrite`                             |
| `name`                             | `Plainwrite`                                                 |
| `type`                             | `sovereign`                                                  |
| `runtime`                          | `native`                                                     |
| `routePrefix`                      | `/plainwrite`                                                |
| `shell`                            | `default`                                                    |
| `adminOnly`                        | omitted (`false`)                                            |
| `icon`                             | `icon.svg`                                                   |
| `permissions`                      | `auth:session`, `db:readWrite`                               |
| `repository`                       | `https://github.com/sovereignfs/sovereign-plugin-plainwrite` |
| `compatibility.minPlatformVersion` | `0.4.0`                                                      |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "io.openfs.sovereign.plainwrite",
  "name": "Plainwrite",
  "version": "0.1.0",
  "description": "A git-backed content editor for static site generators.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/plainwrite",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite"],
  "repository": "https://github.com/sovereignfs/sovereign-plugin-plainwrite",
  "compatibility": {
    "minPlatformVersion": "0.4.0"
  }
}
```

---

## Access control

Plainwrite is available to all authenticated users via the `plugin:access`
capability. There is no admin-only gate.

Access within the plugin is project-scoped:

- A user sees only projects they created or were invited to.
- **Roles:** `owner` (full control: settings, members, all file actions) and
  `editor` (create, edit, commit, and publish files; cannot manage project
  settings or membership).
- **Git provider credentials are per user, per project.** Each user who wants to
  commit or publish must authenticate with the project's git provider. The
  credential (OAuth token or PAT) determines the identity that appears on commits.
- A user with no credential for a private repo project cannot read file content
  from the provider. They can view cached file listings only.

---

## Functional requirements

Requirements are versioned to their milestone. IDs are stable — never renumber
or reuse a PLW-\* id.

### v0.1 — Core (Astro + GitHub)

#### Project management

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLW-01 | Create a project: name, optional description, repository URL, git provider (v0.1: `github`), branch (default: `main`), path prefix (default: `src/content`), SSG type (v0.1: `astro`).                                                                                                                                                                                                                                                                                                                                        |
| PLW-02 | Edit project settings: name, description, branch, path prefix, and SSG type.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PLW-03 | Archive a project (soft-delete). Archived projects are hidden from the default listing but not destroyed. Hard delete is a separate, confirmation-required action.                                                                                                                                                                                                                                                                                                                                                            |
| PLW-04 | Share a project with other Sovereign instance users. Roles: `owner` and `editor`. Owner can invite and remove members.                                                                                                                                                                                                                                                                                                                                                                                                        |
| PLW-05 | Remove a member from a project. An owner cannot remove themselves if they are the only owner (transfer ownership or archive the project instead).                                                                                                                                                                                                                                                                                                                                                                             |
| PLW-06 | Authenticate with the project's git provider. For hosted providers with OAuth configured on the instance (github.com in v0.1): a "Connect [Provider]" button initiates the OAuth 2.0 authorization code flow — the user authorizes in their browser and is redirected back; no token is ever entered manually. For providers without OAuth configured (self-hosted instances), the user enters a Personal Access Token manually. The obtained credential is encrypted at rest. One credential per Sovereign user per project. |
| PLW-07 | Disconnect or re-authenticate a connected provider account. Disconnecting revokes the stored credential; any uncommitted drafts for the project are preserved.                                                                                                                                                                                                                                                                                                                                                                |
| PLW-08 | Sync file listing: fetch the repository's current file tree from the provider and refresh the local file cache. Sync is triggered manually (button) or automatically on project load if the cache is older than a configurable TTL.                                                                                                                                                                                                                                                                                           |

#### File listing

| ID     | Requirement                                                                                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLW-09 | Display all Markdown files (`.md`, `.mdx`) under the configured path prefix, grouped by collection. For Astro, a collection is the immediate subdirectory under the path prefix. Files directly in the prefix are listed as "Root". |
| PLW-10 | Show a per-file status badge for the current user: **Unmodified**, **Draft** (saved, not committed), **Committed** (pending publish), **Conflict** (remote changed since last sync).                                                |
| PLW-11 | Create a new file: choose a collection, enter a filename (auto-slugified to lowercase kebab-case). Opens the editor with a blank template pre-populated with the collection's frontmatter fields.                                   |
| PLW-12 | Stage a file for deletion. The deletion is not pushed to the remote until Publish (PLW-21/PLW-22). A staged deletion is shown in the file listing with a "Pending delete" badge.                                                    |

#### Editor

| ID     | Requirement                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PLW-13 | Open a file for editing. If the current user has an active draft (status `draft` or `committed`) for the file, the draft is loaded. Otherwise file content is fetched from the provider and the `base_sha` is recorded.                                                                          |
| PLW-14 | Frontmatter editor — structured mode. Renders fields from the collection's inferred schema as typed inputs: text (string), date picker (date), number input (number), toggle (boolean), tag input (array of strings). Fields not present in the schema appear as a raw YAML block at the bottom. |
| PLW-15 | Frontmatter editor — raw YAML toggle. A toggle switches the frontmatter pane between the structured form and a raw YAML textarea. Changes made in raw mode are parsed back into the structured view on return.                                                                                   |
| PLW-16 | Markdown body editor with live preview. Split-pane by default on desktop (editor left, rendered HTML right); toggled between edit and preview on narrow viewports.                                                                                                                               |
| PLW-17 | Auto-save to local draft after 30 seconds of typing inactivity. The auto-save interval is a per-user setting. Auto-save is silently reflected in the file status badge.                                                                                                                          |
| PLW-18 | Manual save ("Save"): explicitly persist the current editor state to the `plainwrite_drafts` table with status `draft`.                                                                                                                                                                          |
| PLW-19 | Commit ("Commit"): mark the current draft as `committed` and prompt for an optional commit message (default: `Update <filename>`). The committed draft is ready to publish.                                                                                                                      |
| PLW-20 | Discard changes: revert the file to its last-fetched remote state. Clears the draft record. Requires explicit confirmation.                                                                                                                                                                      |

#### Publishing

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLW-21 | Publish single file: push the committed draft to the remote using the current user's credential. The provider adapter handles the API call. Conflict check (PLW-23) runs before the push; if a conflict is detected, shows a warning and blocks.                                                                                                                                        |
| PLW-22 | Publish All: from the file listing, create a single remote commit containing every file the current user has in `committed` state (edits and staged deletions). The provider adapter performs this atomically — all files land in one commit. Conflict check runs across all files first. A summary of conflicts is shown; the user may skip conflicted files or abort the entire push. |
| PLW-23 | Conflict detection: before any publish action, compare the draft's `base_sha` against the file's current remote blob identifier (fetched via the provider API). A mismatch means the remote file changed since the user started editing. New files (no `base_sha`) and staged deletions for non-existent files are not subject to conflict detection.                                   |

#### Schema

| ID     | Requirement                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLW-24 | Auto-detect collection frontmatter schema on first sync. For each collection, up to five existing files are fetched and their frontmatter is parsed. Field names and value types (string, date, number, boolean, array) are inferred and stored in `plainwrite_collection_schemas`.                |
| PLW-25 | Project owner can view and manually edit the inferred collection schema in project settings: add, remove, or rename fields; change the inferred type; mark fields as required. Manual edits override the auto-inferred schema and are not overwritten by subsequent syncs unless reset explicitly. |

---

### v0.2 — Rich text editor, Jekyll support, images

| ID     | Requirement                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLW-26 | Rich text editor (WYSIWYG): an alternative to the raw Markdown editor. Powered by a ProseMirror-based library (Tiptap or equivalent). Outputs clean CommonMark Markdown — no raw HTML is stored in content files.                                                                                 |
| PLW-27 | Jekyll support: a `JekyllAdapter` implementing the SSG adapter interface scans `_posts/`, `_pages/`, and `_drafts/` for Markdown content. Auto-detect Jekyll frontmatter schema. SSG type option `jekyll` becomes available in project creation. No changes to core file listing or editor logic. |
| PLW-28 | Image upload: upload an image file to the repository via the provider adapter. Upload path is configurable per project (default: `public/images/`). On upload, a Markdown image reference is inserted at the editor cursor position.                                                              |

---

### v0.3 — Collaboration and conflict resolution

| ID     | Requirement                                                                                                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLW-29 | Advisory file lock: when a user opens a file for editing, record an advisory lock visible to other project members in the file listing (shows who is editing). Locks expire automatically after a configurable idle timeout. No hard enforcement — two users can still edit the same file, but the lock is a visible signal. |
| PLW-30 | Conflict resolution UI: when a conflict is detected (PLW-23), show a side-by-side diff of the remote version versus the local committed draft. User can choose: keep local (force-overwrite remote), keep remote (discard local draft), or cancel and merge manually.                                                        |
| PLW-31 | Custom SSG type: a "Custom" project type with a user-defined path prefix and file extension filter. Enables Hugo, Hexo, Eleventy, and similar generators whose content paths differ from Astro's `src/content/` convention.                                                                                                  |

---

## Architecture: provider adapters + DB drafts

Plainwrite keeps no server-side git clone. All content is retrieved and pushed
via provider REST APIs. Local edits live in the Sovereign database as draft
records until explicitly published.

Three layers of abstraction keep core logic free of provider and SSG specifics:

```
┌─────────────────────────────────────┐
│  Core (draft lifecycle, editor, UI) │
└────────────┬──────────┬─────────────┘
             │          │
   ┌──────────▼──┐  ┌────▼────────────┐
   │ Git provider│  │   SSG adapter   │
   │   adapter  │  │  (content disc.) │
   └──────────┬──┘  └────┬────────────┘
              │           │
   GitHub  GitLab  Astro  Jekyll  Hugo …
   Gitea   (self-hosted)
```

### Draft lifecycle

```
User edits file
      │
      ▼
  status: draft        ← Save / Auto-save (DB only, no provider)
      │
      ▼
  status: committed    ← Commit (adds commit message, no provider)
      │
      ▼
  status: published    ← Publish / Publish All (provider API call)
```

### Git provider adapter

Each provider implements a common interface:

```typescript
interface GitProviderAdapter {
  // File tree + content
  getFileTree(project: Project, creds: Credential): Promise<TreeEntry[]>;
  getFileContent(
    project: Project,
    path: string,
    creds: Credential,
  ): Promise<{ content: string; sha: string }>;

  // Publishing
  publishFile(project: Project, file: PendingFile, creds: Credential): Promise<void>;
  publishFiles(
    project: Project,
    files: PendingFile[],
    message: string,
    creds: Credential,
  ): Promise<void>;
  deleteFile(
    project: Project,
    path: string,
    sha: string,
    message: string,
    creds: Credential,
  ): Promise<void>;

  // Auth
  getOAuthUrl(state: string): string | null; // null if OAuth not configured for this provider
  exchangeOAuthCode(code: string): Promise<OAuthTokens>;
  resolveUserInfo(creds: Credential): Promise<{ login: string; displayName: string }>;
}
```

**Providers in v0.1:**

- **`GitHubProvider`** — github.com (and GitHub Enterprise Server via `provider_url`). Single-file publish uses the Contents API; multi-file publish uses the Git Data API (blob → tree → commit → ref update) for atomicity.

**Providers planned post-v0.1:**

- **`GitLabProvider`** — gitlab.com + self-hosted. Multi-file publish uses GitLab's Commits API (`actions` array — a single API call, cleaner than GitHub's multi-step approach).
- **`GiteaProvider`** — Gitea / Forgejo self-hosted instances (Codeberg, etc.). GitHub-compatible API; OAuth 2.0 + PAT.

The factory `getProvider(project)` returns the correct adapter instance from the `provider` and `provider_url` fields on the project. Core publish logic calls only the adapter interface — no provider `if/else` in core code.

### SSG adapter

Each SSG adapter implements content discovery:

```typescript
interface SsgAdapter {
  defaultPathPrefix: string;
  defaultExtensions: string[];
  discoverContent(tree: TreeEntry[], pathPrefix: string): ContentFile[];
  inferCollection(filePath: string, pathPrefix: string): string | null;
  defaultFrontmatterTemplate(collection: string | null): Record<string, unknown>;
}
```

**Adapters in v0.1:**

- **`AstroAdapter`** — path prefix `src/content`, extensions `.md`/`.mdx`. Collection = immediate subdirectory after the prefix.

**Adapters planned:**

- **`JekyllAdapter`** (v0.2) — scans `_posts/`, `_pages/`, `_drafts/`. Collection = directory name.
- **`CustomAdapter`** — user-defined prefix and extensions; flat listing, no automatic collection grouping.
- Future: Hugo (`content/`), Eleventy (user-configurable), Hexo (`source/_posts/`).

`getAdapter(project)` returns the correct adapter from `ssg_type`. The file listing (PLW-09), new-file action (PLW-11), and schema inference (PLW-24) call only the adapter interface.

### OAuth flow

For hosted providers with OAuth configured on the Sovereign instance:

```
1. User clicks "Connect [Provider]" in project credential settings
2. Server generates a state token (CSRF) and redirects to the provider's
   authorization URL (/oauth/authorize?client_id=...&state=...)
3. User approves on the provider's site
4. Provider redirects to /plainwrite/oauth/callback?code=...&state=...
5. Server validates state, exchanges code for access + refresh tokens,
   resolves the user's login, stores encrypted credentials
```

OAuth requires the instance administrator to configure Client ID and Client
Secret for each provider via environment variables:

- `PLAINWRITE_GITHUB_CLIENT_ID` / `PLAINWRITE_GITHUB_CLIENT_SECRET`
- `PLAINWRITE_GITLAB_CLIENT_ID` / `PLAINWRITE_GITLAB_CLIENT_SECRET` (future)

**PAT fallback:** When OAuth is not configured for a provider — including all
self-hosted instances where registering an OAuth App per server is impractical —
the user enters a PAT manually. The credential is stored identically; only the
`auth_type` column differs.

### Credential encryption

All credentials (OAuth access tokens, refresh tokens, PATs) are encrypted with
AES-256-GCM before storage. The encryption key comes from the instance's
`SOVEREIGN_ENCRYPTION_KEY` environment variable (separate from `AUTH_SECRET`).
The IV is generated per-encryption and stored alongside the ciphertext as
`<iv_hex>:<ciphertext_hex>`. Decryption happens in the application layer
immediately before any provider API call — the plaintext credential never leaves
memory.

`SOVEREIGN_ENCRYPTION_KEY` must be set on the instance; Plainwrite throws a
startup error if absent (consistent with the platform rule that no secret may
have a default).

### Multi-file publish — GitHub details

For reference, the GitHub provider's `publishFiles` implementation:

```
1. GET  /repos/{owner}/{repo}/git/ref/heads/{branch}   → latest commit SHA
2. GET  /repos/{owner}/{repo}/git/commits/{sha}         → tree SHA
3. POST /repos/{owner}/{repo}/git/blobs (×N)            → one blob per changed file
4. POST /repos/{owner}/{repo}/git/trees                 → new tree
5. POST /repos/{owner}/{repo}/git/commits               → new commit
6. PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}  → advance branch pointer
```

The branch ref is updated only after all blobs and the tree are created. If step
6 fails, dangling objects are abandoned (GitHub garbage-collects them); no
partial commit lands on the branch.

GitLab's equivalent is a single call: `POST /projects/:id/repository/commits`
with an `actions` array. The adapter interface hides this difference from the
rest of the codebase.

---

## Directory structure

```
sovereign-plugin-plainwrite/
├── manifest.json
├── icon.svg                          # Plainwrite icon — sidebar middle section + Launcher grid
├── app/
│   ├── layout.tsx                    # Plainwrite shell — project sidebar + content area
│   ├── page.tsx                      # All projects overview
│   ├── oauth/
│   │   └── callback/
│   │       └── route.ts              # OAuth callback — validates state, exchanges code
│   └── [projectId]/
│       ├── page.tsx                  # File listing + collection navigation
│       ├── settings/
│       │   └── page.tsx              # Project settings, member management, schema editor
│       └── editor/
│           └── [...filePath]/
│               └── page.tsx          # Editor view (frontmatter + body)
├── db/
│   └── schema.ts                     # all plainwrite_* tables
├── migrations/
├── components/
│   ├── FileTree.tsx                  # Collection/file listing with status badges
│   ├── FrontmatterForm.tsx           # Structured frontmatter inputs
│   ├── FrontmatterYaml.tsx           # Raw YAML textarea (toggle view)
│   ├── MarkdownEditor.tsx            # Split-pane markdown editor + preview
│   ├── CommitPanel.tsx               # Commit message input + Commit/Publish buttons
│   ├── ConflictWarning.tsx           # Conflict detected banner + options
│   └── SchemaSetting.tsx             # Collection schema editor in settings
├── lib/
│   ├── providers/
│   │   ├── types.ts                  # GitProviderAdapter interface + shared types
│   │   ├── github.ts                 # GitHub provider (github.com + GHE)
│   │   ├── gitlab.ts                 # GitLab provider (v0.2+; placeholder in v0.1)
│   │   └── index.ts                  # getProvider(project) factory
│   ├── ssg/
│   │   ├── types.ts                  # SsgAdapter interface + shared types
│   │   ├── astro.ts                  # Astro adapter
│   │   ├── jekyll.ts                 # Jekyll adapter (v0.2+; placeholder in v0.1)
│   │   └── index.ts                  # getAdapter(project) factory
│   ├── frontmatter.ts                # Parse/serialize frontmatter via gray-matter
│   ├── schema-infer.ts               # Auto-detect collection schema from file samples
│   ├── oauth.ts                      # OAuth state generation + token exchange helpers
│   └── crypto.ts                     # AES-GCM credential encryption/decryption
└── package.json
```

**Key dependency:** `gray-matter` — de-facto standard for parsing YAML/TOML
frontmatter from Markdown files. No viable alternative with the same feature set
and maintenance status.

---

## Data model

Six tables, all prefixed `plainwrite_`. All carry `tenant_id` per the platform
architectural rule (SRS hard rules).

### `plainwrite_projects`

| Column         | Type       | Notes                                                                                                                                    |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid / pk  |                                                                                                                                          |
| `tenant_id`    | string     |                                                                                                                                          |
| `created_by`   | string     | FK → users.                                                                                                                              |
| `name`         | string     |                                                                                                                                          |
| `description`  | string?    | Nullable.                                                                                                                                |
| `provider`     | string     | Enum: `github` \| `gitlab` \| `gitea` \| `custom`. v0.1: `github` only. Selects the `GitProviderAdapter` implementation.                 |
| `provider_url` | string?    | Nullable. Base URL for self-hosted instances (e.g. `https://gitlab.mycompany.com`). Null for well-known hosted providers.                |
| `repo_owner`   | string     | Repository namespace (GitHub username/org, GitLab group/user). Parsed from the repo URL on project creation.                             |
| `repo_name`    | string     | Repository name. Parsed from the repo URL.                                                                                               |
| `branch`       | string     | Default: `main`.                                                                                                                         |
| `path_prefix`  | string     | Default: `src/content`. Root path scanned for content files. Meaning is provider-independent; interpretation belongs to the SSG adapter. |
| `ssg_type`     | string     | Enum: `astro` \| `jekyll` \| `custom`. v0.1: `astro` only. Selects the `SsgAdapter` implementation.                                      |
| `is_private`   | boolean    | Informational flag set on project creation. Does not gate access.                                                                        |
| `archived_at`  | timestamp? | Nullable. Soft-archive timestamp.                                                                                                        |
| `created_at`   | timestamp  |                                                                                                                                          |
| `updated_at`   | timestamp  |                                                                                                                                          |

### `plainwrite_project_members`

| Column       | Type                | Notes                                                        |
| ------------ | ------------------- | ------------------------------------------------------------ |
| `project_id` | uuid                | FK → `plainwrite_projects`.                                  |
| `tenant_id`  | string              |                                                              |
| `user_id`    | string              | FK → users.                                                  |
| `role`       | `owner` \| `editor` | Owner row is inserted automatically on project creation.     |
| `invited_by` | string?             | Nullable. FK → users. Null for the original project creator. |
| `joined_at`  | timestamp           |                                                              |

Composite PK: (`project_id`, `user_id`).

### `plainwrite_credentials`

| Column                    | Type       | Notes                                                                                                                                                   |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_id`              | uuid       | FK → `plainwrite_projects`.                                                                                                                             |
| `tenant_id`               | string     |                                                                                                                                                         |
| `user_id`                 | string     | FK → users.                                                                                                                                             |
| `auth_type`               | string     | Enum: `oauth` \| `pat`. Determines how the credential was obtained.                                                                                     |
| `access_token_encrypted`  | text       | AES-256-GCM encrypted access token (OAuth or PAT). Stored as `<iv_hex>:<ciphertext_hex>`.                                                               |
| `refresh_token_encrypted` | text?      | Nullable. AES-256-GCM encrypted OAuth refresh token. Null for PAT credentials and providers that do not issue refresh tokens (GitHub OAuth App).        |
| `token_expires_at`        | timestamp? | Nullable. Expiry for short-lived access tokens. Null for PATs and non-expiring OAuth tokens. When set, the provider adapter refreshes before API calls. |
| `provider_login`          | string?    | Nullable. Username on the provider (e.g. `kasunben` on GitHub). Resolved on connect; stored for display and commit attribution.                         |
| `created_at`              | timestamp  |                                                                                                                                                         |
| `updated_at`              | timestamp  |                                                                                                                                                         |

Composite PK: (`project_id`, `user_id`).

### `plainwrite_file_cache`

| Column           | Type      | Notes                                                                                                                         |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid / pk |                                                                                                                               |
| `tenant_id`      | string    |                                                                                                                               |
| `project_id`     | uuid      | FK → `plainwrite_projects`.                                                                                                   |
| `path`           | string    | Full path in repo (e.g. `src/content/blog/my-post.md`).                                                                       |
| `collection`     | string?   | Nullable. Derived: immediate subdirectory after `path_prefix`. Null for files directly in the prefix ("Root" in the listing). |
| `filename`       | string    | Filename only (e.g. `my-post.md`).                                                                                            |
| `sha`            | string    | Provider blob identifier at last sync (SHA hash for GitHub/GitLab/Gitea). Used as the baseline for conflict detection.        |
| `last_synced_at` | timestamp |                                                                                                                               |

Unique index: (`project_id`, `path`).

### `plainwrite_drafts`

| Column           | Type       | Notes                                                                                                                                                                     |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid / pk  |                                                                                                                                                                           |
| `tenant_id`      | string     |                                                                                                                                                                           |
| `project_id`     | uuid       | FK → `plainwrite_projects`.                                                                                                                                               |
| `file_path`      | string     | Full repo path. For new files, no corresponding row in `plainwrite_file_cache` yet.                                                                                       |
| `user_id`        | string     | FK → users. Each user has at most one active draft per file.                                                                                                              |
| `content`        | text?      | Nullable. Full file content (frontmatter + body). `null` represents a staged deletion.                                                                                    |
| `status`         | string     | Enum: `draft` \| `committed` \| `published`.                                                                                                                              |
| `commit_message` | string?    | Nullable. Set on Commit action.                                                                                                                                           |
| `base_sha`       | string?    | Nullable. Provider blob identifier when the file was fetched. `null` for new files. Compared against the current remote identifier before publish for conflict detection. |
| `committed_at`   | timestamp? | Nullable.                                                                                                                                                                 |
| `published_at`   | timestamp? | Nullable.                                                                                                                                                                 |
| `created_at`     | timestamp  |                                                                                                                                                                           |
| `updated_at`     | timestamp  |                                                                                                                                                                           |

Unique index: (`project_id`, `file_path`, `user_id`). Upsert on this key — at
most one active draft per file per user.

**Draft re-open logic:** When a user opens a file, if a `draft` or `committed`
draft exists for that user, it is loaded. If the most recent draft is
`published`, it is ignored and fresh content is fetched from the provider. This ensures
the editor always reflects either the user's unpublished work or the current
remote state.

### `plainwrite_collection_schemas`

| Column        | Type       | Notes                                                                                                                                                        |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | uuid / pk  |                                                                                                                                                              |
| `tenant_id`   | string     |                                                                                                                                                              |
| `project_id`  | uuid       | FK → `plainwrite_projects`.                                                                                                                                  |
| `collection`  | string     | Collection name. `__root__` for files directly in the path prefix with no subdirectory.                                                                      |
| `schema`      | json       | Array of `{ name: string, type: "string" \| "date" \| "number" \| "boolean" \| "array", required: boolean, default?: string \| number \| boolean \| null }`. |
| `inferred_at` | timestamp? | Nullable. Timestamp of last auto-detection run. Null if schema was created entirely manually.                                                                |
| `updated_at`  | timestamp  |                                                                                                                                                              |
| `updated_by`  | string?    | Nullable. FK → users. Set when a project owner manually edits the schema; null for auto-inferred schemas not yet manually touched.                           |

Unique index: (`project_id`, `collection`).

**Schema inference:** On first sync, Plainwrite fetches up to five files from
each collection via the provider adapter and calls `gray-matter` to parse their
frontmatter. For each field, the type is inferred from the union of values
observed (string wins over number when types are mixed). The resulting schema is
a best-effort starting point; the project owner is expected to review and correct
it via PLW-25.

---

## SDK dependencies

| SDK surface | Used for                                                | Available from |
| ----------- | ------------------------------------------------------- | -------------- |
| `sdk.auth`  | Current user session; user lookup for member management | Task 0.4.02    |
| `sdk.db`    | Read/write all `plainwrite_*` tables                    | Task 0.5.05    |

Plainwrite requires no `sdk.mailer` in v1.

**Note on `SOVEREIGN_ENCRYPTION_KEY`:** This env var must be present for
Plainwrite to start. The platform startup-secret convention (throw on missing
secret, no default) applies. This may require the platform to surface an
extensible mechanism for plugins to declare required env vars — flag as a
platform concern for v0.5 planning.

---

## UI

Plainwrite consumes `@sovereignfs/ui` (components and `--sv-*` tokens)
exclusively.

**Layout:** Two-panel on desktop — project/collection sidebar on the left,
content area on the right. The editor is full-width when open (sidebar collapses
to an icon strip). Collapses to a single-pane stack on mobile.

**Net-new primitives likely needed in `packages/ui`:**

- **Status badge** — small inline chip with variant colours for Unmodified /
  Draft / Committed / Conflict states. Reusable across Plainwrite and potentially
  any plugin that surfaces file or item status.
- **Split pane** — resizable two-column layout for editor + preview. Likely
  useful for other data-entry plugins.
- **Tag input** — multi-value text input where each value is a removable chip.
  Used for frontmatter array fields. Reusable for Tasks (future tag support) and
  other plugins.
- **Code / YAML textarea** — monospace textarea with basic syntax-aware
  whitespace handling for the raw YAML toggle view.

Drive these into `packages/ui` rather than building them inline.

---

## Build plan

Four milestones, each a separate branch + PR in the
`sovereign-plugin-plainwrite` repo. Requires Sovereign platform ≥ v0.4.0.

### v0.1 — Core (PLW-01–25)

Project CRUD (with `provider` + `provider_url` + `ssg_type` from day one),
OAuth 2.0 connect flow for GitHub plus PAT fallback, credential encryption,
project sharing with owner/editor roles, file listing sync (provider adapter →
file cache), SSG adapter–driven collection grouping (Astro in v0.1), file status
badges, new file creation, staged deletion, the editor (frontmatter
structured/YAML + Markdown + preview), auto-save, save / commit / publish
workflows, conflict detection, frontmatter schema auto-detection and manual
editing.

**Done when:** A user can connect a GitHub repo via OAuth, browse its Astro
content collections, open a Markdown file, edit frontmatter and body, commit
locally, and publish to GitHub — with a conflict warning if the remote file was
changed between opening and publishing.

### v0.2 — Rich text, Jekyll, images (PLW-26–28)

WYSIWYG rich text editor mode (Tiptap / ProseMirror), Jekyll adapter
(`JekyllAdapter` implementing `SsgAdapter`), image upload via provider adapter
with cursor insertion.

**Done when:** A non-technical user can write content without seeing Markdown
syntax; a Jekyll site can be connected; images can be uploaded from the editor.
Adding Jekyll required only a new `SsgAdapter` implementation — no changes to
core editor or publish logic.

### v0.3 — Collaboration (PLW-29–31)

Advisory file locking with presence indicator, conflict resolution diff UI
(keep local / keep remote / cancel), custom SSG type with configurable path
prefix.

**Done when:** Multiple users working on the same project see who is editing
which file; a user encountering a conflict can resolve it from within the UI
without reaching for a git client; Hugo/Hexo/Eleventy repositories are
connectable.

### v1.0 — Stable

Polish, documentation, plugin developer guide entry. Plainwrite is the reference
implementation for plugins that interact with third-party APIs and manage
credentials.

---

## Open questions

1. **`SOVEREIGN_ENCRYPTION_KEY` and plugin-declared secrets.** Credential
   encryption requires an instance-level secret beyond `AUTH_SECRET`. The current
   platform convention covers only well-known platform vars. Options: allow plugins
   to declare required env vars in the manifest (`requiredEnv: [...]`); or
   introduce a `sdk.secrets` surface that abstracts secure storage. Resolve before
   v0.1 ships — this affects any plugin that manages third-party credentials.

2. **OAuth Client ID/Secret management.** OAuth requires a Client ID and Client
   Secret per provider, configured via env vars (`PLAINWRITE_GITHUB_CLIENT_ID`
   etc.). Should these be admin-configurable through the Console plugin (stored
   encrypted in DB, no restart needed) instead of env vars? Env vars for v0.1
   (consistent with platform approach); Console-managed config is a platform
   feature request for later.

3. **Self-hosted providers and OAuth.** Registering an OAuth App for every
   possible self-hosted Gitea/GitLab instance is impractical. For self-hosted
   providers (`provider_url` is non-null), PAT is the primary auth method — no
   OAuth flow is offered. Confirm this is acceptable, or decide whether Plainwrite
   should support a "bring your own OAuth app" mode where the project owner
   supplies a client ID/secret for their specific instance.

4. **New collection creation.** v0.1 allows creating files only within collections
   that already exist in the repository. Creating a new Astro collection (a new
   subdirectory under `src/content/`) requires a placeholder file. Flag for v0.2:
   a "New collection" action that creates a `.gitkeep`-style placeholder via the
   provider adapter, then refreshes the file cache.

5. **Publish All commit message.** When publishing multiple committed files
   (PLW-22), each file may have its own commit message. For the single combined
   commit: (a) generic message (`Publish N files`), (b) joined individual
   messages, or (c) prompt for a combined message with individual messages shown
   for reference. Recommendation: option (c).

6. **Staged deletion and conflicts.** If a user has staged a deletion and the
   remote file was modified, the conflict is ambiguous: remote updated, local
   deleted. PLW-23 will detect and block. PLW-30 (v0.3) should handle this as a
   distinct "delete vs. update" conflict type, not the same as an edit conflict.

7. **Provider API rate limits.** Schema inference (PLW-24) fetches up to 5 files
   per collection. GitHub: 5,000 req/hr per token; GitLab: 2,000 req/10 min;
   Gitea: instance-configurable. Schema inference runs only once (at first sync).
   If rate limits become a concern, batch via the provider's recursive tree API to
   fetch the full tree in one call, with content fetched lazily on first open.

---

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                                                                   |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2     | Jun 2026 | Replaced manual PAT with OAuth 2.0 flow (PAT as fallback). Introduced `GitProviderAdapter` and `SsgAdapter` interfaces. Added `provider`/`provider_url` columns to projects; revised credentials table for OAuth tokens and refresh tokens. Added manifest `icon` field and missing `tenant_id` columns. |
| 0.1     | Jun 2026 | Initial draft — feature set, data model, and GitHub API architecture designed from scratch.                                                                                                                                                                                                              |
