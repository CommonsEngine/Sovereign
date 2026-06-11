# Sovereign Tasks

**Version:** 0.2\
**Date:** June 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign Tasks plugin — the single source of truth for its manifest, access model, data model, and build plan.\
**Status:** Draft

---

Sovereign Tasks is a privacy-first, self-hosted alternative to Google Tasks.
**Simplicity and minimalism are the core design principles** — the goal is a
cleaner, private Google Tasks, not a Todoist clone. Every feature decision is
measured against that bar: does it reduce friction without adding cognitive load?

The plugin is `type: sovereign` — maintained in a separate external repository
(`sovereign-plugin-tasks`) and the primary reference implementation for how an
externally-maintained plugin integrates with the Sovereign SDK.

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                                                     |
| ---------------------------------- | --------------------------------------------------------- |
| `id`                               | `io.openfs.sovereign.tasks`                               |
| `name`                             | `Tasks`                                                   |
| `type`                             | `sovereign`                                               |
| `runtime`                          | `native`                                                  |
| `routePrefix`                      | `/tasks`                                                  |
| `shell`                            | `default`                                                 |
| `adminOnly`                        | omitted (`false`)                                         |
| `icon`                             | `icon.svg`                                                |
| `permissions`                      | `auth:session`, `db:readWrite`                            |
| `repository`                       | `https://github.com/CommonsEngine/sovereign-plugin-tasks` |
| `compatibility.minPlatformVersion` | `0.4.0`                                                   |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "io.openfs.sovereign.tasks",
  "name": "Tasks",
  "version": "0.1.0",
  "description": "A minimal, privacy-first task manager.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/tasks",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite"],
  "repository": "https://github.com/CommonsEngine/sovereign-plugin-tasks",
  "compatibility": {
    "minPlatformVersion": "0.4.0"
  }
}
```

## Access control

Tasks is available to all authenticated users via the `plugin:access` capability
(`platform:user` and `platform:admin` both have it). There is no admin-only gate.

Within the plugin, access is data-scoped:

- **Tasks are private by default.** A user's tasks are never visible to other
  users unless the containing list is explicitly shared.
- **Lists can be shared** with specific users on the instance. A shared list is
  visible to all its members.
- **Task assignment** is only possible within shared lists — a task may be
  assigned to any list member (including the owner).

## Functional requirements

Requirements are versioned to their milestone. IDs are stable — never renumber
or reuse a TSK-\* id.

### v0.1 — Core

| ID     | Requirement                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------- |
| TSK-01 | Create, rename, and delete lists.                                                                         |
| TSK-02 | Lists have an optional color for visual distinction.                                                      |
| TSK-03 | Share a list with other users on the instance by inviting them. Roles: `owner` and `member`.              |
| TSK-04 | Remove a member from a shared list. An owner cannot leave their own list (transfer or delete instead).    |
| TSK-05 | Deleting a list deletes all tasks within it.                                                              |
| TSK-06 | Create, edit, and delete tasks within a list.                                                             |
| TSK-07 | Tasks have: title (required), notes (optional free text), and sort order.                                 |
| TSK-08 | Subtasks — one level deep. Subtasks cannot themselves have subtasks.                                      |
| TSK-09 | Mark a task (and all its subtasks) complete, or reopen a completed task.                                  |
| TSK-10 | Manual sort order via drag-reorder within a list.                                                         |
| TSK-11 | Show/hide completed tasks toggle per list. Completed tasks are hidden by default; manual delete required. |
| TSK-12 | Assign a task to any member within a shared list.                                                         |

### v0.2 — Due dates and power-user features

| ID     | Requirement                                                                             |
| ------ | --------------------------------------------------------------------------------------- |
| TSK-13 | Add a due date to a task (date only, or date and time). Due time requires a due date.   |
| TSK-14 | Overdue tasks (past due date, not completed) are visually distinguished.                |
| TSK-15 | Filter tasks within a list: All / Active / Completed / Overdue.                         |
| TSK-16 | Cross-list search by task title.                                                        |
| TSK-17 | Keyboard shortcuts for common actions: new task, complete task, navigate between lists. |
| TSK-18 | Bulk select tasks and delete selected.                                                  |
| TSK-19 | Bulk select tasks and move selected to another list.                                    |

### v0.3 — Recurrence

Recurrence is implemented using the `rrule` npm package (RFC 5545 RRULE). No
custom recurrence logic is written.

| ID     | Requirement                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TSK-20 | Set a recurrence rule on a task. Supported patterns: daily; weekly; monthly; yearly; every N days; every N weeks; specific weekdays (e.g. Mon + Wed + Fri); nth day of month (e.g. last Friday of the month). |
| TSK-21 | Completing a recurring task marks it done and generates a new sibling task for the next occurrence (same `series_id`, `recurrence_rule`, list, and assignee).                                                 |
| TSK-22 | Editing a recurring task prompts the user: edit this instance only / this and all future instances / all instances.                                                                                           |
| TSK-23 | Recurring tasks display their recurrence pattern (human-readable summary) in the task UI.                                                                                                                     |

## Directory structure

The plugin lives in its own external repository. Structure follows the standard
plugin layout (SRS §2.3).

```
sovereign-plugin-tasks/
├── manifest.json
├── icon.svg                    # Tasks icon — sidebar middle section + Launcher grid
├── app/
│   ├── layout.tsx              # tasks shell — list sidebar + content area
│   ├── page.tsx                # lists overview (all lists, new list CTA)
│   └── [listId]/
│       └── page.tsx            # tasks in a list
├── db/
│   └── schema.ts               # tasks_lists, tasks_list_members, tasks_items
├── migrations/                 # Drizzle migration files
├── components/
│   ├── TaskItem.tsx            # individual task row
│   ├── SubtaskList.tsx         # subtask expansion
│   ├── BulkActionBar.tsx       # bulk select/delete/move (v0.2)
│   └── RecurrenceEditor.tsx    # recurrence pattern editor (v0.3)
├── lib/
│   └── recurrence.ts           # rrule helpers: next occurrence, rule → human string
└── package.json
```

## Data model

Three tables, all prefixed `tasks_`. All carry `tenant_id` per the platform
architectural rule (SRS hard rules).

### `tasks_lists`

| Column       | Type      | Notes                                      |
| ------------ | --------- | ------------------------------------------ |
| `id`         | uuid / pk |                                            |
| `tenant_id`  | string    |                                            |
| `owner_id`   | string    | FK → users. The user who created the list. |
| `title`      | string    |                                            |
| `color`      | string?   | Nullable. See open question 1.             |
| `sort_order` | integer   | Owner's preferred list order.              |
| `created_at` | timestamp |                                            |

### `tasks_list_members`

| Column      | Type                | Notes                                                 |
| ----------- | ------------------- | ----------------------------------------------------- |
| `list_id`   | uuid                | FK → `tasks_lists`.                                   |
| `tenant_id` | string              |                                                       |
| `user_id`   | string              | FK → users.                                           |
| `role`      | `owner` \| `member` | Owner row is inserted automatically on list creation. |
| `joined_at` | timestamp           |                                                       |

Composite PK: (`list_id`, `user_id`).

### `tasks_items`

| Column            | Type       | Notes                                                                              |
| ----------------- | ---------- | ---------------------------------------------------------------------------------- |
| `id`              | uuid / pk  |                                                                                    |
| `tenant_id`       | string     |                                                                                    |
| `list_id`         | uuid       | FK → `tasks_lists`.                                                                |
| `parent_id`       | uuid?      | Nullable. FK → `tasks_items`. Presence = subtask. One level enforced at app layer. |
| `assignee_id`     | string?    | Nullable. FK → users. Only meaningful within shared lists.                         |
| `title`           | string     |                                                                                    |
| `notes`           | text?      | Nullable.                                                                          |
| `due_date`        | date?      | Nullable. Added v0.2.                                                              |
| `due_time`        | time?      | Nullable. Requires `due_date`. Added v0.2.                                         |
| `completed_at`    | timestamp? | Nullable. Set on completion, cleared on reopen.                                    |
| `sort_order`      | integer    |                                                                                    |
| `recurrence_rule` | string?    | Nullable. RRULE string (RFC 5545). Added v0.3.                                     |
| `series_id`       | uuid?      | Nullable. Shared across all instances of a recurring series. Added v0.3.           |
| `created_at`      | timestamp  |                                                                                    |
| `updated_at`      | timestamp  |                                                                                    |

**Recurrence mechanics:** When a recurring task is completed, `completed_at` is
set and a new sibling row is inserted with the same `list_id`, `recurrence_rule`,
`series_id`, and `assignee_id`, and with `due_date` advanced to the next
occurrence as calculated by `rrule`. The `series_id` enables "edit this and all
future" (filter by `series_id` + `due_date >= this task's due_date`) and "edit
all" (filter by `series_id` only).

## SDK dependencies

| SDK surface | Used for                                             | Available from |
| ----------- | ---------------------------------------------------- | -------------- |
| `sdk.auth`  | Current user session; user lookup for sharing/assign | Task 0.4.02    |
| `sdk.db`    | Read/write all tasks tables                          | Task 0.5.05    |

Tasks requires no `sdk.mailer` or `sdk.platform` in v1.

**Sequencing note:** Tasks targets `minPlatformVersion: 0.4.0`, but `sdk.db` is
not fully implemented until Task 0.5.05. Development can begin against the stubbed
`sdk.db` (direct table access via `packages/db`); the SDK-routed path should be
finalized when 0.5.05 lands. Track any temporary direct-table access so it can be
migrated.

## UI

Tasks consumes `@sovereignfs/ui` (components and `--sv-*` tokens) exclusively —
no hardcoded colours, spacing, or radii.

**Layout:** Two-panel on desktop — list sidebar on the left, task pane on the
right. Collapses to stacked (list view → task view) on mobile.

**Net-new primitives likely needed in `packages/ui`:** drag-handle row (for sort
reorder), checkbox with animated strike-through label, date/time picker, bulk
action bar (floating, appears on selection), recurrence pattern editor (v0.3).
Drive these into `packages/ui` rather than building them inline — they are broadly
reusable across plugins.

## Build plan

Four milestones, each a separate branch + PR in the `sovereign-plugin-tasks` repo.
Requires Sovereign platform ≥ v0.4.0.

### v0.1 — Core (TSK-01–12)

Lists CRUD, task CRUD, subtasks, notes, manual sort, show/hide completed, list
sharing with owner/member roles, basic task assignment within shared lists.

**Done when:** A user can create lists, add tasks and subtasks, complete and
reopen tasks, share a list with another instance user, and assign a task to a
list member.

### v0.2 — Due dates and power-user features (TSK-13–19)

Due date + time, overdue distinction, filtering (All / Active / Completed /
Overdue), cross-list search, keyboard shortcuts, bulk delete and move.

**Done when:** Tasks with due dates surface correctly in filters and overdue
styling; keyboard shortcuts cover the core actions; bulk select operates on
multiple tasks in one action.

### v0.3 — Recurrence (TSK-20–23)

Full recurrence via the `rrule` package. Generate-next-instance model on
completion. Edit-this / this-and-future / all modes. Human-readable rule
display.

**Done when:** A recurring task generates a correctly-dated next instance on
completion; editing a recurring task presents the three-mode prompt; the
recurrence pattern displays legibly in the task UI.

### v1.0 — Stable

Polish, documentation, plugin developer guide reference. No new features; no
scope expansion. The Tasks plugin is the primary reference implementation for
external plugin developers.

## Open questions

1. **List color palette.** Use a fixed set of swatches derived from `--sv-*`
   primitive tokens (simpler, theme-safe, consistent), or allow arbitrary hex
   (more flexible, harder to ensure contrast)? Fixed set recommended.
2. **Member removal — task assignment.** When a member is removed from a shared
   list, their assigned tasks should be auto-unassigned (`assignee_id` → null)
   rather than transferred to the owner. Confirm before implementing TSK-04.
3. **Assignment notifications.** In-app notification when a task is assigned to
   you is out of scope for v1 but the data model must not preclude it. Note for
   v1.1 planning.
4. **Google Tasks import.** Google Takeout exports Tasks as JSON. An import tool
   would lower the migration barrier for the target user. Out of scope v1; flag
   as a v1.1 candidate.

## Changelog

| Version | Date     | Change                                                                              |
| ------- | -------- | ----------------------------------------------------------------------------------- |
| 0.2     | Jun 2026 | Added manifest `icon` field; added missing `tenant_id` to `tasks_list_members`.     |
| 0.1     | Jun 2026 | Initial draft — feature set designed from Google Tasks analysis and design session. |
