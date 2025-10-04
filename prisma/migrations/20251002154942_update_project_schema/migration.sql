/*
  Warnings:

  - You are about to drop the column `project_id` on the `post_meta` table. All the data in the column will be lost.
  - You are about to drop the column `git_auth_secret` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `git_auth_type` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `git_branch` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `git_content_dir` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `git_last_commit` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `git_provider` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `git_repo_url` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `kind` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `live_url` on the `projects` table. All the data in the column will be lost.
  - Added the required column `cmsgit_id` to the `post_meta` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ProjectCmsgit" (
    "project_id" TEXT NOT NULL PRIMARY KEY,
    "repo_url" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "content_dir" TEXT,
    "last_commit" TEXT,
    "provider" TEXT DEFAULT 'github',
    "auth_type" TEXT DEFAULT 'ssh',
    "auth_secret" TEXT,
    CONSTRAINT "ProjectCmsgit_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectCanvasGraph" (
    "project_id" TEXT NOT NULL PRIMARY KEY,
    "width" INTEGER,
    "height" INTEGER,
    "bg_color" TEXT,
    CONSTRAINT "ProjectCanvasGraph_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectWorkspace" (
    "project_id" TEXT NOT NULL PRIMARY KEY,
    CONSTRAINT "ProjectWorkspace_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_post_meta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "excerpt" TEXT,
    "pubDate" DATETIME,
    "draft" BOOLEAN DEFAULT true,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "cmsgit_id" TEXT NOT NULL,
    CONSTRAINT "post_meta_cmsgit_id_fkey" FOREIGN KEY ("cmsgit_id") REFERENCES "ProjectCmsgit" ("project_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_post_meta" ("createdAt", "deletedAt", "draft", "excerpt", "id", "path", "pubDate", "tags", "title", "updatedAt") SELECT "createdAt", "deletedAt", "draft", "excerpt", "id", "path", "pubDate", "tags", "title", "updatedAt" FROM "post_meta";
DROP TABLE "post_meta";
ALTER TABLE "new_post_meta" RENAME TO "post_meta";
CREATE INDEX "post_meta_cmsgit_id_idx" ON "post_meta"("cmsgit_id");
CREATE UNIQUE INDEX "post_meta_cmsgit_id_path_key" ON "post_meta"("cmsgit_id", "path");
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "desc" TEXT,
    "public_url" TEXT,
    "type" TEXT NOT NULL DEFAULT 'cmsgit',
    "scope" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_projects" ("created_at", "desc", "id", "name", "status", "type", "updated_at", "user_id") SELECT "created_at", "desc", "id", "name", "status", "type", "updated_at", "user_id" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
