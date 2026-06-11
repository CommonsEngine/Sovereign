# Sovereign Splitify

**Version:** 0.2\
**Date:** June 2026\
**Author:** kasunben, DishanRajapaksha\
**Purpose:** Canonical specification for the Sovereign Splitify plugin — the single source of truth for its manifest, access model, data model, and build plan.\
**Status:** Draft

---

Sovereign Splitify is a privacy-first, self-hosted alternative to Splitwise for
tracking shared expenses and settling debts. The scope is all Splitwise free-tier
functionality, plus features Splitwise gates behind its Pro tier (debt
simplification, CSV export). There are no ads, no limits, no bank or payment
integrations.

The plugin is `type: sovereign` — maintained in a separate external repository
(`sovereign-plugin-splitify`) and the reference implementation for a plugin that
exercises `sdk.mailer`.

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

| Property                           | Value                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| `id`                               | `io.openfs.sovereign.splitify`                               |
| `name`                             | `Splitify`                                                   |
| `type`                             | `sovereign`                                                  |
| `runtime`                          | `native`                                                     |
| `routePrefix`                      | `/splitify`                                                  |
| `shell`                            | `default`                                                    |
| `adminOnly`                        | omitted (`false`)                                            |
| `icon`                             | `icon.svg`                                                   |
| `permissions`                      | `auth:session`, `db:readWrite`, `mailer:send`                |
| `repository`                       | `https://github.com/CommonsEngine/sovereign-plugin-splitify` |
| `compatibility.minPlatformVersion` | `0.4.0`                                                      |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "io.openfs.sovereign.splitify",
  "name": "Splitify",
  "version": "0.1.0",
  "description": "Shared expense tracking and debt settlement.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/splitify",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite", "mailer:send"],
  "repository": "https://github.com/CommonsEngine/sovereign-plugin-splitify",
  "compatibility": {
    "minPlatformVersion": "0.4.0"
  }
}
```

Splitify is the first reference plugin to declare `mailer:send` — used for
expense notifications and settlement summary emails (v0.2). It validates the
`sdk.mailer` surface end-to-end.

## Access control

Available to all authenticated users via `plugin:access`. No admin gate.

Data-scoped within the plugin: a user sees only groups they are a member of.
**Guest members** (non-Sovereign users added by name and optional email) appear
in balances and can receive settlement emails at their address, but cannot log in
to the instance to view data.

## Functional requirements

Requirements are versioned to their milestone. IDs are stable — never renumber
or reuse an SPL-\* id.

### v0.1 — Core

| ID     | Requirement                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPL-01 | Create, rename, and archive groups. A group has: name, optional description, default currency (ISO 4217), and debt-simplification toggle (default on).                                                                                                                                |
| SPL-02 | Delete a group — only when all member balances are zero.                                                                                                                                                                                                                              |
| SPL-03 | Add instance users to a group. Add guest members by name + optional email address.                                                                                                                                                                                                    |
| SPL-04 | Remove a member from a group — only when their balance is zero.                                                                                                                                                                                                                       |
| SPL-05 | Add an expense: description, amount, date, category (fixed set), single payer, split among selected members using the chosen split method. Amounts stored as integers (smallest unit).                                                                                                |
| SPL-06 | Edit an expense.                                                                                                                                                                                                                                                                      |
| SPL-07 | Soft-delete an expense — preserved in the activity feed as deleted; balances recalculated immediately.                                                                                                                                                                                |
| SPL-08 | Activity feed per group — chronological list of all expenses and settlements.                                                                                                                                                                                                         |
| SPL-09 | Balance view per group — net balance per member pair; simplified when debt-simplification toggle is on.                                                                                                                                                                               |
| SPL-10 | Overall balance summary across all groups for the current user.                                                                                                                                                                                                                       |
| SPL-11 | Debt simplification: greedy minimum-transaction algorithm reduces N pairwise debts to the minimum number of payments needed to settle a group.                                                                                                                                        |
| SPL-12 | Split by exact amount: each member owes a specified amount; amounts must sum to the expense total.                                                                                                                                                                                    |
| SPL-13 | Split by percentage: each member owes a percentage; percentages must sum to 100%.                                                                                                                                                                                                     |
| SPL-14 | Split by shares: each member assigned a number of shares; amount divided proportionally.                                                                                                                                                                                              |
| SPL-15 | Multiple payers on a single expense: each payer records how much they paid; totals must equal expense amount.                                                                                                                                                                         |
| SPL-24 | In-app notification feed — a bell indicator in the Splitify layout shows unread notifications for the current user. Events that generate a notification: added to a group; new expense added to a group you're in; set as a payer on an expense; a settlement recorded involving you. |
| SPL-25 | Mark notifications as read — individually or all at once.                                                                                                                                                                                                                             |
| SPL-26 | Browser push notifications via Web Push API (VAPID). Users can subscribe to push notifications in any modern browser or PWA; the server sends a push for the same events as SPL-24. Native push (APNs/FCM) defers to the Capacitor shell (post-v1).                                   |

**Expense categories (fixed set):** Food & Drink, Housing, Transport,
Entertainment, Health, Shopping, Travel, Other.

### v0.2 — Settlements and power features

| ID     | Requirement                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| SPL-16 | Record a settlement (payment) from one member to another within a group. Fields: amount, optional date, optional notes. |
| SPL-19 | Export group expenses and settlements to CSV.                                                                           |
| SPL-20 | Comments on expenses: free-text notes added by any group member after the expense is created.                           |

### v0.3 — Multi-currency

| ID     | Requirement                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| SPL-21 | Record an expense in a currency other than the group's default currency.                                                        |
| SPL-22 | Manual exchange rate entry when recording a non-default-currency expense. Automatic currency conversion is explicitly deferred. |
| SPL-23 | Balances displayed per currency when a group contains expenses in multiple currencies.                                          |

### v0.4 — Email notifications

| ID     | Requirement                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| SPL-17 | Expense notification email to all group members when a new expense is added (uses `sdk.mailer`; no-ops when SMTP unconfigured).          |
| SPL-18 | Settlement summary email: current balances + minimum-transaction settlement suggestions, sent on demand or triggered on group settle-up. |

## Directory structure

```
sovereign-plugin-splitify/
├── manifest.json
├── icon.svg                    # Splitify icon — sidebar middle section + Launcher grid
├── app/
│   ├── layout.tsx              # groups sidebar + content area
│   ├── page.tsx                # all groups overview + overall balance
│   └── [groupId]/
│       └── page.tsx            # activity feed + balance view + actions
├── db/
│   └── schema.ts               # all splitify_* tables
├── migrations/                 # Drizzle migration files
├── components/
│   ├── ExpenseForm.tsx         # add/edit expense
│   ├── SplitEditor.tsx         # equal/amount/percentage/shares UI
│   ├── PayerSelector.tsx       # single + multiple payers
│   ├── BalanceView.tsx         # per-group balances + simplified debt list
│   ├── SettlementForm.tsx      # record a settlement
│   └── NotificationBell.tsx    # bell indicator + unread feed
├── lib/
│   ├── balance.ts              # balance calculation + debt simplification algorithm
│   └── push.ts                 # Web Push VAPID helpers (subscribe, send)
└── package.json
```

## Data model

Eight tables, all prefixed `splitify_`. All carry `tenant_id` per the platform
architectural rule.

### `splitify_groups`

| Column           | Type       | Notes                         |
| ---------------- | ---------- | ----------------------------- |
| `id`             | uuid / pk  |                               |
| `tenant_id`      | string     |                               |
| `created_by`     | string     | FK → users.                   |
| `name`           | string     |                               |
| `description`    | string?    | Nullable.                     |
| `currency`       | string     | ISO 4217 code (e.g. `"USD"`). |
| `simplify_debts` | boolean    | Default `true`.               |
| `archived_at`    | timestamp? | Nullable. Set on archive.     |
| `created_at`     | timestamp  |                               |

### `splitify_group_members`

| Column        | Type      | Notes                                                           |
| ------------- | --------- | --------------------------------------------------------------- |
| `id`          | uuid / pk |                                                                 |
| `tenant_id`   | string    |                                                                 |
| `group_id`    | uuid      | FK → `splitify_groups`.                                         |
| `user_id`     | string?   | Nullable. FK → users. Null for guest members.                   |
| `guest_name`  | string?   | Nullable. Required when `user_id` is null.                      |
| `guest_email` | string?   | Nullable. Used for sending emails to guests without an account. |
| `joined_at`   | timestamp |                                                                 |

Constraint: exactly one of (`user_id`, `guest_name`) must be non-null (enforced
at app layer). Unique index on (`group_id`, `user_id`) for instance-user members.

### `splitify_expenses`

| Column         | Type       | Notes                                                                                          |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `id`           | uuid / pk  |                                                                                                |
| `tenant_id`    | string     |                                                                                                |
| `group_id`     | uuid       | FK → `splitify_groups`.                                                                        |
| `description`  | string     |                                                                                                |
| `amount`       | integer    | Cents (smallest currency unit). Never store as float.                                          |
| `currency`     | string     | ISO 4217. Defaults to group currency. Set at creation.                                         |
| `category`     | enum       | `food_drink \| housing \| transport \| entertainment \| health \| shopping \| travel \| other` |
| `date`         | date       |                                                                                                |
| `notes`        | text?      | Nullable.                                                                                      |
| `split_method` | enum       | `equal \| amount \| percentage \| shares`                                                      |
| `created_by`   | string     | FK → users.                                                                                    |
| `created_at`   | timestamp  |                                                                                                |
| `updated_at`   | timestamp  |                                                                                                |
| `deleted_at`   | timestamp? | Nullable. Soft delete — row preserved for activity feed.                                       |

### `splitify_expense_payers`

| Column        | Type    | Notes                                                                         |
| ------------- | ------- | ----------------------------------------------------------------------------- |
| `expense_id`  | uuid    | FK → `splitify_expenses`.                                                     |
| `tenant_id`   | string  |                                                                               |
| `member_id`   | uuid    | FK → `splitify_group_members`.                                                |
| `amount_paid` | integer | Cents. In v0.1: one row per expense (full amount). v0.2 allows multiple rows. |

Composite PK: (`expense_id`, `member_id`).

### `splitify_expense_shares`

| Column         | Type    | Notes                                                                |
| -------------- | ------- | -------------------------------------------------------------------- |
| `expense_id`   | uuid    | FK → `splitify_expenses`.                                            |
| `tenant_id`    | string  |                                                                      |
| `member_id`    | uuid    | FK → `splitify_group_members`.                                       |
| `share_amount` | integer | Cents. Sum across all rows for an expense must equal expense amount. |

### `splitify_settlements`

| Column           | Type      | Notes                          |
| ---------------- | --------- | ------------------------------ |
| `id`             | uuid / pk |                                |
| `tenant_id`      | string    |                                |
| `group_id`       | uuid      | FK → `splitify_groups`.        |
| `from_member_id` | uuid      | FK → `splitify_group_members`. |
| `to_member_id`   | uuid      | FK → `splitify_group_members`. |
| `amount`         | integer   | Cents.                         |
| `currency`       | string    | ISO 4217.                      |
| `date`           | date?     | Nullable.                      |
| `notes`          | string?   | Nullable.                      |
| `created_by`     | string    | FK → users.                    |
| `created_at`     | timestamp |                                |

**Balance calculation** is computed at query time (not stored). For each member
pair in a group: sum of `share_amount` they owe across all non-deleted expenses,
minus sum of `amount_paid` they contributed, adjusted by settlements. When
`simplify_debts` is on, the resulting net-balance array is passed through the
greedy minimum-transaction algorithm in `lib/balance.ts`.

### `splitify_notifications`

| Column       | Type       | Notes                                                                                     |
| ------------ | ---------- | ----------------------------------------------------------------------------------------- |
| `id`         | uuid / pk  |                                                                                           |
| `tenant_id`  | string     |                                                                                           |
| `user_id`    | string     | FK → users. The recipient.                                                                |
| `type`       | enum       | `added_to_group \| expense_added \| set_as_payer \| settlement_recorded`                  |
| `group_id`   | uuid?      | Nullable. FK → `splitify_groups`. Context for the notification.                           |
| `expense_id` | uuid?      | Nullable. FK → `splitify_expenses`. Set for expense/payer events.                         |
| `actor_id`   | string?    | Nullable. FK → users. The user who triggered the event (null if triggered by the system). |
| `read_at`    | timestamp? | Nullable. Set when the user marks it read.                                                |
| `created_at` | timestamp  |                                                                                           |

### `splitify_push_subscriptions`

| Column       | Type      | Notes                                    |
| ------------ | --------- | ---------------------------------------- |
| `id`         | uuid / pk |                                          |
| `tenant_id`  | string    |                                          |
| `user_id`    | string    | FK → users.                              |
| `endpoint`   | string    | Web Push subscription endpoint URL.      |
| `p256dh`     | string    | Client public key (Web Push encryption). |
| `auth`       | string    | Auth secret (Web Push encryption).       |
| `created_at` | timestamp |                                          |

One user may have multiple subscriptions (different browsers/devices). A failed
push delivery (HTTP 410 Gone) should delete the subscription row.

## SDK dependencies

| SDK surface  | Used for                                        | Available from |
| ------------ | ----------------------------------------------- | -------------- |
| `sdk.auth`   | User session; user lookup for member management | Task 0.4.02    |
| `sdk.db`     | Read/write all `splitify_*` tables              | Task 0.5.05    |
| `sdk.mailer` | Settlement summary + expense emails (v0.4)      | Task 0.4.02    |

**Sequencing note:** Like Tasks, Splitify targets `minPlatformVersion: 0.4.0` but
`sdk.db` is not fully implemented until Task 0.5.05. Track any temporary
direct-table access for migration when 0.5.05 lands.

## UI

Two-panel layout: groups list in a sidebar, content area showing the activity
feed or balance view for the selected group.

**Net-new `@sovereignfs/ui` primitives likely needed:** split-method selector
(segmented control), member multi-select with guest-add support, integer currency
input (amount entry with proper decimal display), inline balance chip
(green/red for owed/owing), CSV download trigger button.

Drive these into `packages/ui` rather than building inline — balance chips and
currency inputs are broadly useful across future financial plugins.

## Build plan

### v0.1 — Core (SPL-01–15, SPL-24–26)

Groups with default currency and debt-simplification toggle, guest members,
expense CRUD with all four split methods (equal, by amount, by percentage, by
shares), multi-payer expenses, activity feed, per-group and overall balance views,
debt simplification, in-app notification feed, browser push notifications.

**Done when:** A user can create a group, add expenses with any split method and
multiple payers, view simplified balances, receive an in-app notification when a
group member adds an expense, and subscribe to browser push notifications.

### v0.2 — Settlements and power features (SPL-16, SPL-19–20)

Record settlements, CSV export, expense comments.

**Done when:** A settlement reduces balances correctly; CSV export downloads a
complete group history; members can comment on expenses.

### v0.3 — Multi-currency (SPL-21–23)

Record expenses in non-default currencies with manual exchange rate. Balances
display per currency when mixed.

**Done when:** A group with USD and EUR expenses shows separate per-currency
balances; editing the exchange rate on an expense recalculates immediately.

### v0.4 — Email notifications (SPL-17–18)

Expense notification emails and settlement summary emails via `sdk.mailer`.

**Done when:** Expense notification emails send (or no-op without SMTP);
settlement summary email delivers current balances and suggested payments.

### v1.0 — Stable

Documentation, polish, plugin developer guide reference. No scope expansion.

## Open questions

1. **Delete group with unsettled balances.** Recommendation: warn + require
   confirmation but allow — real groups are often abandoned rather than fully
   settled. Block is too strict.
2. **Guest member emails.** Settlement summary emails reach a guest's inbox
   without a login link — they can read the numbers but cannot interact.
   Acceptable for v1; flag for v1.1 as a "join instance from Splitify invite"
   flow.
3. **Personal IOUs.** Splitwise has a dedicated two-person IOU flow. In Splitify,
   a two-member group covers this without a special concept. Confirm this is
   sufficient before shipping v0.1.
4. **Balance computation performance.** Query-time calculation is clean for v1
   (small groups, moderate expense counts). Pre-aggregated snapshots can be added
   later without schema changes if needed.

## Changelog

| Version | Date     | Change                                                                                    |
| ------- | -------- | ----------------------------------------------------------------------------------------- |
| 0.2     | Jun 2026 | Added manifest `icon` field; added missing `tenant_id` to member/payer/share/push tables. |
| 0.1     | Jun 2026 | Initial draft — feature set designed from Splitwise analysis and design session.          |
