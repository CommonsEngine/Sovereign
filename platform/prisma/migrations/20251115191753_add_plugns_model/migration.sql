/*
  Warnings:

  - You are about to drop the `papertrail_attachment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `papertrail_boards` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `papertrail_comments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `papertrail_edges` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `papertrail_node_tags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `papertrail_nodes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tags` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "papertrail_attachment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "papertrail_boards";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "papertrail_comments";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "papertrail_edges";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "papertrail_node_tags";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "papertrail_nodes";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "tags";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "plugins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plugin_id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dev_only" BOOLEAN NOT NULL DEFAULT true,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "core_plugin" BOOLEAN NOT NULL DEFAULT false,
    "installed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_validated_at" DATETIME,
    "enabled_at" DATETIME,
    "disabled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "task_lists" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "list_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATETIME,
    "recurring_config" JSONB,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "task_lists" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_reminders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "task_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "reminder_at" DATETIME NOT NULL,
    "snooze_until" DATETIME,
    "source_plugin" TEXT,
    CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_list_share_invites" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "list_id" INTEGER NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "task_list_share_invites_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "task_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "plugins_plugin_id_key" ON "plugins"("plugin_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugins_namespace_key" ON "plugins"("namespace");

-- CreateIndex
CREATE INDEX "plugins_core_plugin_idx" ON "plugins"("core_plugin");

-- CreateIndex
CREATE INDEX "task_lists_user_id_idx" ON "task_lists"("user_id");

-- CreateIndex
CREATE INDEX "task_lists_position_idx" ON "task_lists"("position");

-- CreateIndex
CREATE UNIQUE INDEX "task_lists_user_id_slug_key" ON "task_lists"("user_id", "slug");

-- CreateIndex
CREATE INDEX "tasks_user_id_idx" ON "tasks"("user_id");

-- CreateIndex
CREATE INDEX "tasks_list_id_idx" ON "tasks"("list_id");

-- CreateIndex
CREATE INDEX "tasks_position_idx" ON "tasks"("position");

-- CreateIndex
CREATE INDEX "task_reminders_user_id_idx" ON "task_reminders"("user_id");

-- CreateIndex
CREATE INDEX "task_reminders_task_id_idx" ON "task_reminders"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_list_share_invites_token_key" ON "task_list_share_invites"("token");

-- CreateIndex
CREATE INDEX "task_list_share_invites_list_id_idx" ON "task_list_share_invites"("list_id");

-- CreateIndex
CREATE INDEX "task_list_share_invites_email_idx" ON "task_list_share_invites"("email");

-- CreateIndex
CREATE INDEX "task_list_share_invites_inviter_id_idx" ON "task_list_share_invites"("inviter_id");
