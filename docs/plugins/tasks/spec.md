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

These can be layered on top once the core state model and Phase 0 UI are stable.
