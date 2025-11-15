# Sovereign Tasks

## Phase-0

A dead-simple, Google Tasks–style task manager implemented as a single HTML file. In Phase 0 everything runs fully in the browser with a single global state object on `window.$state`, and the UI is a pure function of that state.

This document defines the **Phase 0 feature scope** and the **shape of `$state`**, including a sample state object.

---

### 1. Phase 0 Goals

- Provide a minimal but usable task manager inside Sovereign.
- Keep the implementation **brutally simple**:
  - One HTML file, one script, no build step required.
  - No backend, no database, no browser storage yet.
  - All data lives in `window.$state` and is lost on refresh.
- Design the state shape so it can be:
  - Serialized later (for localStorage / API / DB).
  - Extended in future phases (recurring tasks, sharing, persistence, etc.).

---

### 2. Phase 0 Feature List

#### 2.1 Core Functional Features

1. **Single-page UI**

- Entire app lives in one HTML file.
- Layout concept (Kanban-style):
  - A single horizontal row of columns, each column representing a List.
  - Each List displays its Task Cards vertically.
  - After the last column, an "Add List" input column is displayed.
  - After the last Task Card inside each column, an "Add Task" input card is displayed.
  - Each List header includes an action icon on the right that opens a context menu (Rename List, Delete List, Sort options).
  - Lists can be reordered via drag-and-drop.
  - Task Cards can be reordered within a list via drag-and-drop and can be moved between lists.
  - Tasks can be starred (important), giving them visual priority.
  - Each Task Card may include many optional fields, but **title** is the only mandatory user input field.

2. **Global in-memory state**
   - On page load, the script initializes `window.$state`.
   - No network calls, no storage – pure in-browser global state.

3. **Default list: Inbox**
   - On first initialization, create a default list:
     - Name: `Inbox`
     - Slug: `inbox`
   - `Inbox` becomes the active list by default.

4. **List management**
   - Create list
     - User can create additional lists with a name.
   - Rename list
     - User can rename any list (including Inbox).
   - Delete list

5. **Task CRUD (per list)**
   - Add task
     - Add a new task to the currently active list.
     - Minimum input: **title** (string).
   - Edit task (inline)
     - Change the `title` of a task.
   - Toggle completion
     - Mark task as completed / uncompleted.
   - Delete task
     - Remove a task from the list.

6. **Optional task metadata (Phase 0 support)**
   - **Description**
     - Optional free-text description/notes.
   - **Due date**
     - Optional ISO date string (no time, or time ignored in Phase 0).
   - **Recurring**
     - Stored as a structured object but **no recurrence logic** is executed in Phase 0.
     - Used only as data; UI can show a small indicator if recurrence is set.

7. **Simple filtering**
   - Filter tasks in the active list by status:
     - `all`
     - `active` (not completed)
     - `completed`

---

#### 2.2 Non-functional / Architecture

1. **Single render function**
   - A single `render()` function is responsible for updating the DOM based on `window.$state`.
   - After any state change, the app must:
     1. Update `$state`.
     2. Update `$state.meta.updatedAt`.
     3. Call `render()`.

2. **State must be serializable**
   - `$state` must be JSON-serializable after stripping out any functions.
   - All dates are stored as ISO strings.

3. **No persistence in Phase 0**
   - No localStorage, no cookies, no server calls.
   - This keeps the implementation simple and forces a clean state model first.

4. **Sovereign flavor, Google Tasks–like UX**
   - The visual layout is inspired by Google Tasks but styled with Sovereign’s design language.
   - Phase 0 is not about pixel-perfect design, just a reasonable, minimal UX.

---

### 3. Global State Shape (`window.$state`)

In Phase 0, the state is intentionally simple but structured for future growth.

```js
window.$state = {
  meta: {
    createdAt: string,  // ISO timestamp of first initialization
    updatedAt: string,  // ISO timestamp of last mutation
    version: '0.1.0',   // Phase 0 state version
  },

  data: {
    lists: {
      // [listId]: List
      [listId: number]: {
        id: number,
        name: string,
        slug: string,
        createdAt: string, // ISO
        updatedAt: string, // ISO
      },
    },

    tasks: {
      // [taskId]: Task
      [taskId: number]: {
        id: number,
        listId: number,
        title: string,
        description?: string | null,
        dueDate?: string | null, // ISO date or datetime string
        recurring?: {
          rule: 'daily' | 'weekly' | 'monthly' | 'custom',
          interval?: number, // every X days/weeks/months
        } | null,
        completed: boolean,
        starred: boolean,
        createdAt: string, // ISO
        updatedAt: string, // ISO
      },
    },

    taskIdsByListId: {
      // [listId]: taskId[] ordered for display
      [listId: number]: number[],
    },

    listOrder: number[],
  },

  ui: {
    taskFilter: 'all' | 'active' | 'completed',
  },
};
```

#### Notes on this shape

- **`meta`**: Global metadata about the current snapshot of state.
- **`data.lists` and `data.tasks`**:
  - Objects keyed by `id` for O(1) access and future server alignment.
  - IDs are numbers in Phase 0 (simple auto-increment generator in JS is fine).
- **`data.taskIdsByListId`**:
  - Preserves ordering within a list and makes reordering trivial later.
  - Also makes it easy to render tasks for a list without scanning all tasks.
- **Redundancy (`listId` + `taskIdsByListId`)**:
  - Slight duplication, but convenient both for rendering and for future API/DB design.
- `listOrder` preserves the horizontal ordering of lists in the board layout.
- `starred` enables prioritization and visual emphasis of important tasks.

---

## 4. Example `$state` Object (Phase 0)

This is a concrete example of what `$state` might look like after some usage.

```js
window.$state = {
  meta: {
    createdAt: "2025-11-13T18:00:00.000Z",
    updatedAt: "2025-11-13T18:15:30.000Z",
    version: "0.1.0",
  },

  data: {
    lists: {
      1: {
        id: 1,
        name: "Inbox",
        slug: "inbox",
        createdAt: "2025-11-13T18:00:00.000Z",
        updatedAt: "2025-11-13T18:00:00.000Z",
      },
      2: {
        id: 2,
        name: "Sovereign Core",
        slug: "sovereign-core",
        createdAt: "2025-11-13T18:05:10.000Z",
        updatedAt: "2025-11-13T18:05:10.000Z",
      },
    },

    tasks: {
      100: {
        id: 100,
        listId: 1,
        title: "Buy coffee beans",
        description: "For the next two weeks",
        dueDate: "2025-11-15",
        recurring: null,
        completed: false,
        starred: false,
        createdAt: "2025-11-13T18:02:00.000Z",
        updatedAt: "2025-11-13T18:02:00.000Z",
      },
      101: {
        id: 101,
        listId: 2,
        title: "Draft Phase 0 spec for Sovereign Tasks",
        description: "Define features and $state shape",
        dueDate: null,
        recurring: null,
        completed: true,
        starred: false,
        createdAt: "2025-11-13T18:06:00.000Z",
        updatedAt: "2025-11-13T18:10:00.000Z",
      },
      102: {
        id: 102,
        listId: 2,
        title: "Implement $state init + render()",
        description: null,
        dueDate: null,
        recurring: {
          rule: "daily",
          interval: 1,
        },
        completed: false,
        starred: true,
        createdAt: "2025-11-13T18:12:30.000Z",
        updatedAt: "2025-11-13T18:12:30.000Z",
      },
    },

    taskIdsByListId: {
      1: [100],
      2: [101, 102],
    },

    listOrder: [1, 2],
  },

  ui: {
    taskFilter: "all",
  },
};
```

This example should be used as the reference when developing the initial implementation and tests for Phase 0.

---

### 5. Out of Scope for Phase 0

The following are explicitly **not** part of Phase 0:

- Persistence (localStorage, IndexedDB, server, database).
- User accounts, multi-user access, or syncing.
- Advanced recurrence logic (auto-generating future tasks).
- Reminders, notifications, or calendar integrations.

---

## 6. Current Implementation Status (Phase 0 → Phase 2)

This section summarizes what is already implemented in the Sovereign Tasks plugin, and how it maps to the phases described above.

### 6.1 Phase 0 – Single‑Page, In‑Memory Tasks (Implemented)

The Phase 0 goals are effectively complete, with a few pragmatic deviations:

- **Single HTML + Script**
  - Tasks UI is implemented as a single Handlebars/HTML view (`tasks/index`) with inline `<script>` that initializes `window.$state` and renders the board.
  - The app is rendered inside the Sovereign App Shell (header + sidebar come from core).

- **State Shape**
  - `$state.meta`, `$state.data.lists`, `$state.data.tasks`, `$state.data.taskIdsByListId`, `$state.data.listOrder`, and `$state.ui.taskFilter` are implemented closely to the Phase‑0 shape, with additional fields introduced in later phases (see below).
  - IDs are numeric and local to the browser; lists and tasks are keyed by `id`.

- **Lists**
  - Default `Inbox` list with `id: 1`, name `Inbox`, slug `inbox` is created on first load.
  - Users can create additional lists, rename any list, and delete lists.
  - Lists are rendered as horizontal columns (Kanban style) and can be reordered via drag‑and‑drop; horizontal order is stored in `data.listOrder`.

- **Tasks**
  - Users can create tasks in any list via an inline “Add task” input.
  - Each task at minimum has a `title`; `completed` and `starred` flags are supported.
  - Tasks belong to a list via `listId` and are ordered via `taskIdsByListId[listId]`.
  - Tasks can be toggled between completed/uncompleted and deleted.

- **Filtering**
  - A simple filter bar allows `all`, `active`, and `completed` views per list, backed by `$state.ui.taskFilter`.

### 6.2 Phase 1 – Local Persistence, Modal Editing & Recurrence UI (Implemented)

On top of Phase 0, Phase 1 adds richer task metadata, a better editing flow, and local persistence while keeping the app offline‑first.

- **Local Persistence (Phase 1.0)**
  - `$state` is serialized to `localStorage` under a single key.
  - On load, the app attempts to hydrate from storage; if nothing valid is found, it falls back to the default Inbox state.
  - A `meta.version` field and a `migrateState()` function are used to evolve the state shape safely over time.

- **Task Details Modal**
  - Clicking a task opens a modal dialog to edit:
    - `title` (mandatory)
    - `description` (optional free text)
    - `dueDate` (stored as `YYYY‑MM‑DD` in `$state`)
    - `starred` (important flag)
    - `completed` (status)
    - `recurring` (structured object; see below)
  - Save and Delete actions are available from the modal footer.

- **Recurring Tasks (Phase 1.1)**
  - A structured `task.recurring` object is implemented, with:
    - **Presets**: `daily`, `weekly`, `monthly`, `yearly`, `weekday`.
    - **Custom recurrence**: `every N [day|week|month|year]`.
    - **Ends** options:
      - `never`
      - `on date`
      - `after N times`
  - When a recurring task is completed:
    - The next due date is computed based on its recurrence configuration.
    - `after N times` decrements the remaining count; when it reaches zero, recurrence stops.
    - `on date` stops recurrence once the end date passes.
  - The card UI shows subtle hints:
    - e.g. “(2 left)” for `afterCount` recurrences,
    - e.g. “Ends on 2025‑12‑12” for `onDate` recurrences,
    - and a small indicator that the task is repeating.

- **List Context Menu & Bulk Actions**
  - Each list header has a settings icon that opens a context menu with:
    - Sort options (by created time, title A–Z, due date).
    - “Delete completed tasks” (bulk delete within that list).
    - “Delete list” (with confirmation).
  - The context menu UI is styled to match Sovereign’s design language and closes on outside click.

- **Layout & UX Refinements**
  - List columns have a fixed header and a scrollable body so long lists remain usable.
  - Completed tasks automatically move to the bottom within their list.
  - “Add list” and “Add task” inputs are placed in the header region of the column for quicker access.
  - Task cards include a small trash icon for quick deletion.

### 6.3 Phase 2 – Server‑Backed Persistence (In Progress)

Phase 2 work has started with a focus on **read‑only bootstrap** and **best‑effort write‑through** to the backend, while still keeping the client offline‑first. The full sync queue described later in this document is not yet implemented.

In addition, Phase 2 now includes an initial implementation of **per‑list sharing via email invites**, scoped to the current user as inviter. This is not yet a full multi‑user ACL system, but it provides an end‑to‑end flow for inviting other users to a list and seeing who has been invited.

- **Backend Schema (Prisma Extension)**
  - A plugin Prisma extension defines:
    - `TaskList` model:
      - `id`, `userId`, `name`, `slug`, `position`, timestamps.
    - `Task` model:
      - `id`, `userId`, `listId`, `title`, `description`, `dueDate`, `completed`, `starred`, `position`, timestamps.
      - `recurringConfig` as a `Json?` field representing the structured recurrence:
        - `kind: 'preset' | 'custom'`
        - `preset?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekday'`
        - `custom?: { interval: number, unit: 'day' | 'week' | 'month' | 'year', ends: { type: 'never' | 'onDate' | 'afterCount', date?: string, count?: number } }`

    - **TaskListShareInvite** model (Prisma extension)
      - Represents an invitation from the current user (inviter) to share a specific list with an email address.
      - Fields:
        - `id` – primary key.
        - `listId` – FK to `TaskList`.
        - `inviterId` – Sovereign user id of the inviting user.
        - `email` – invitee email address.
        - `token` – unique opaque token used in the accept‑invite URL.
        - `role` – currently a simple string, e.g. `"viewer"` or `"editor"` (defaults to `"editor"`).
        - `status` – `"pending"`, `"accepted"`, or `"revoked"`; used to track invite lifecycle.
        - `createdAt`, `updatedAt` – timestamps.
      - Mapped to the `task_list_share_invites` table and related to `TaskList` with `onDelete: Cascade`.

    - **TaskReminder** model (planned, already present in Prisma extension)
      - Not yet wired into the UI or API, but designed as the foundation for notifications and snoozing.
      - Fields include:
        - `taskId`, `userId` – which task and which user the reminder belongs to.
        - `reminderAt` – when the reminder should first trigger.
        - `snoozeUntil` – optional; next time the reminder should trigger after snoozing.
        - `sourcePlugin` – optional plugin identifier (e.g., calendar, travel, finance) that created the reminder.
      - A future background worker will scan due reminders and deliver notifications via email, in‑app, or push, and update `snoozeUntil` as users snooze them.

  - A seed script creates sample lists and tasks, including examples with `recurringConfig`.

- **API Layer (Express, under `/api/plugins/tasks`)**
  - Implemented endpoints:
    - `GET    /api/plugins/tasks/bootstrap` – returns all lists and tasks for the current user (used to hydrate `$state`).
    - `GET    /api/plugins/tasks/lists` – list all lists.
    - `POST   /api/plugins/tasks/lists` – create list.
    - `PUT    /api/plugins/tasks/lists/:id` – update/rename list.
    - `DELETE /api/plugins/tasks/lists/:id` – delete list and its tasks.
    - `PUT    /api/plugins/tasks/lists/order` – update horizontal `position` for lists.
    - `GET    /api/plugins/tasks` – list tasks (optionally by `listId`).
    - `POST   /api/plugins/tasks` – create task.
    - `PUT    /api/plugins/tasks/:id` – update task fields (title, metadata, completed, starred, list).
    - `DELETE /api/plugins/tasks/:id` – delete task.
    - `PUT    /api/plugins/tasks/order` – reorder tasks within a list and/or move tasks into a list.
    - `DELETE /api/plugins/tasks/lists/:id/completed` – bulk delete all completed tasks in a given list.
    - `POST   /api/plugins/tasks/lists/:id/share` – create a share invite for a list and send an email via the Sovereign mailer; persists a `TaskListShareInvite` row and returns invite metadata (id, token, status).
    - `GET    /api/plugins/tasks/bootstrap` – now also returns an `invites` array (all `TaskListShareInvite` rows where `inviterId` is the current user), which the frontend normalizes into `$state.data.shareInvitesByListId`.
  - All routes enforce per‑user scoping via `userId` lookup before mutating any list/task.

- **Client‑Side Bootstrap & ID Mapping**
  - On first load (or when local state looks like a fresh, empty Inbox), the client:
    - Initializes `$state` from localStorage or a default state.
    - If the state appears to be a default “empty Inbox” and the browser is online, calls `GET /api/plugins/tasks/bootstrap`.
    - Normalizes the server response into the local `$state` shape.
  - Each list and task remembers server IDs:
    - `list.remoteId` – server primary key for that list.
    - `task.remoteId` – server primary key for that task.
    - `task.remoteListId` – server primary key for the parent list.
    - `$state.sync.remoteListIds[localListId] = remoteListId` – a mapping from local list ids to server list ids for sync.

- **Sharing UI & State (Phase 2 – In Progress)**
  - Each list header context menu now includes a **“Share list…”** action.
  - Clicking it opens a modal dialog that:
    - Shows a short explanation (“Share &lt;list name&gt; with another user by email.”).
    - Provides an email input field with lightweight validation.
    - Lists existing invites for that list, showing email + status (`pending`, `accepted`, `revoked`, or `skipped`).
  - When the user submits a new email:
    - The client looks up the list’s `remoteId` and calls `POST /api/plugins/tasks/lists/:id/share` (if the list is already synced; otherwise it shows an error that unsynced lists cannot be shared).
    - On success, the returned invite metadata is merged into `$state.data.shareInvitesByListId[listId]`, the state is saved to localStorage, and the UI re‑renders.
  - `$state` has been extended with:
    - `data.shareInvitesByListId: { [listId: number]: { id: number | null, email: string, status: string }[] }` – a per‑list array of share invites.
  - The list header shows a small “Shared” pill next to the list title when there is at least one invite for that list.

- **Best‑Effort Write‑Through Sync (No Queue Yet)**
  - After local mutations, the client **immediately updates `$state` and localStorage** and then, if online, sends a non‑blocking sync request:
    - `addList` → `POST /api/plugins/tasks/lists` (captures `remoteId` on success).
    - `renameList` → `PUT /api/plugins/tasks/lists/:remoteId`.
    - `deleteList` → `DELETE /api/plugins/tasks/lists/:remoteId`.
    - `addTask` → `POST /api/plugins/tasks` (using `remoteListId` if known; skips sync if it is not).
    - `toggleTaskCompleted`, `toggleTaskStarred`, `saveTaskFromModal` → `PUT /api/plugins/tasks/:remoteTaskId`.
    - `deleteTask` → `DELETE /api/plugins/tasks/:remoteTaskId`.
    - `deleteCompletedTasksInList` → `DELETE /api/plugins/tasks/lists/:remoteListId/completed`.
  - Network errors and offline conditions are ignored; the UI continues to operate on local state.
  - A full, durable sync queue with retries and conflict handling is planned but **not yet implemented**; the current behaviour is “best‑effort write‑through” rather than strict synchronization.

---

Phase 2 introduces a backend‑connected model for Sovereign Tasks while preserving the simplicity of the Phase‑0/1 architecture and ensuring backwards compatibility for offline use.

The primary goal of Phase 2 is **synchronization**: local `$state` acts as an optimistic, authoritative client state, but changes are mirrored to the Sovereign backend, enabling multi‑device usage, cross‑browser persistence, and integration with other Sovereign modules.

---

### 7.1 Phase 2 Goals

1. **Persist `$state` to the Sovereign backend** in a normalized structure.
2. **Sync across devices**: load tasks/lists from the user account, not the browser.
3. **Offline‑first**: continue using localStorage as a write‑ahead cache.
4. **Permit partial sync failures** without blocking the UI.
5. **Enable interoperability** with:
   - Reminders/Notifications
   - Calendar plugin
   - Notes / PaperTrail
   - Sovereign Automation / Agent features

---

### 7.2 Sync Model Overview

The recommended model is a **client‑first optimistic write** system:

1. User action → update local `$state` immediately (fast; no blocking).
2. Queue a sync job (list/task creation, update, delete).
3. Sync layer POSTs/PUTs to the backend API.
4. Backend responds with authoritative record (IDs/timestamps).
5. Client merges server response back into `$state`.
6. Save merged `$state` to localStorage.

This ensures:

- Instant local UI updates.
- Reliable multi-device consistency.
- Minimal merge conflicts.

---

### 7.3 API Endpoints (Draft)

These endpoints mirror the normalized shape currently in `$state`.

**Lists**

- `GET    /api/tasks/lists` → returns all lists
- `POST   /api/tasks/lists` → create list
- `PUT    /api/tasks/lists/:id` → rename/update
- `DELETE /api/tasks/lists/:id`

**Tasks**

- `GET    /api/tasks` → returns all tasks for the user
- `POST   /api/tasks` → create new task
- `PUT    /api/tasks/:id` → update title, completed, starred, metadata
- `DELETE /api/tasks/:id`

**Ordering**

- `PUT /api/tasks/order` → update `taskIdsByListId` for a list
- `PUT /api/tasks/lists/order` → update horizontal `listOrder`

**State Versioning**

- `GET /api/tasks/meta` → returns server’s authoritative version/timestamps
- `PUT /api/tasks/meta` → client pushes local meta

---

### 7.4 Data Model (Proposed Server Schema)

**Table: task_lists**

- id (uuid or int)
- user_id
- name
- slug
- created_at
- updated_at
- position (for ordering)

**Table: tasks**

- id (uuid or int)
- list_id
- user_id
- title
- description
- due_date
- recurring_rule
- recurring_interval
- completed
- starred
- created_at
- updated_at
- position (for ordering inside list)

**Table: task_metadata** (optional future table for reminders + automation)

- task_id
- reminder_at
- snooze_until
- source_plugin

---

### 7.5 Sync Queue (Client‑Side)

A tiny, persistent queue stored in localStorage:

```js
$state.syncQueue = [
  { op: 'create-task', payload: {...}, localId: 101 },
  { op: 'update-task', payload: {...}, id: 202 },
  { op: 'delete-list', payload: { id: 3 } },
];
```

Rules:

- Never block UI on network.
- Retry failed operations with exponential fallback.
- When online again, flush queue automatically.
- Server may override local IDs (map `localId → serverId`).
- Merge authoritative timestamps: server timestamp wins.

---

### 7.6 Offline‑First Behavior

- If offline, everything continues working as Phase‑1.
- All mutations append to `syncQueue`.
- Upon reconnection, background worker syncs everything.
- UI should show a subtle offline indicator but continue working normally.

---

### 7.7 Conflict Resolution Rules

Conflicts are minimal because client‑first overwrite is expected. Recommended policy:

- **Client wins on edits** (title, completed, starred, due date).
- **Server wins on IDs** and authoritative timestamps.
- **List/Task deletion** wins over edits.
- If server returns a merge error, automatically **regenerate local state** and merge client changes back in.

---

### 7.8 Security & Multi‑User Considerations

- All requests authenticated using Sovereign SSO (session cookie or access token).
- Each list/task belongs to a single user.
- Future: shared lists via ACLs.
- API should reject any operation where `user_id` mismatch occurs.

---

### 7.9 Phase 2 Deliverables

1. **Backend**
   - API routes + validation
   - Prisma schema / database migrations
   - Authorization middleware
   - Conflict resolution layer

2. **Frontend**
   - Sync queue engine
   - Migration from Phase‑1 `$state` → normalized API payloads
   - Merge server updates into local state
   - Offline/online detection hooks
   - Subtle UI indicators (syncing, offline)

3. **Sovereign Integration**
   - User accounts via core session
   - Potential integration with Reminders/Calendar
   - Scoping Task data per Sovereign tenant

---

## 8. Beyond Phase 2 (Future Ideas)

- Shared lists / team spaces (Phase 2 introduces per‑list email invites; a full multi‑user ACL and team‑spaces model remains future work)
- Smart lists (Today, Starred, Next 7 Days)
- Notifications & reminders
- Keyboard‑driven quick‑add overlay
- Attachments or links (e.g., from Notes/PaperTrail)
- AI‑powered prioritization or task rewriting

---
