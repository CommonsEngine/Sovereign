/*
  Warnings:

  - You are about to drop the column `title` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `handler` on the `users` table. All the data in the column will be lost.
  - Added the required column `git_repo_url` to the `projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "post_meta" (
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
    "project_id" TEXT NOT NULL,
    CONSTRAINT "post_meta_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ProjectAdmins" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ProjectAdmins_A_fkey" FOREIGN KEY ("A") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ProjectAdmins_B_fkey" FOREIGN KEY ("B") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ProjectEditors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ProjectEditors_A_fkey" FOREIGN KEY ("A") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ProjectEditors_B_fkey" FOREIGN KEY ("B") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "desc" TEXT,
    "live_url" TEXT,
    "git_repo_url" TEXT NOT NULL,
    "git_branch" TEXT DEFAULT 'main',
    "git_content_dir" TEXT,
    "git_last_commit" TEXT,
    "git_provider" TEXT,
    "git_auth_type" TEXT,
    "git_auth_secret" TEXT,
    "type" TEXT NOT NULL DEFAULT 'blog',
    "kind" TEXT NOT NULL DEFAULT 'generic',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "user_id" TEXT,
    CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_projects" ("created_at", "id", "status", "updated_at", "user_id") SELECT "created_at", "id", "status", "updated_at", "user_id" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email_verified_at" DATETIME,
    "password_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("created_at", "email", "email_verified_at", "id", "password_hash", "updated_at") SELECT "created_at", "email", "email_verified_at", "id", "password_hash", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "users_email_verified_at_idx" ON "users"("email_verified_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "post_meta_project_id_path_key" ON "post_meta"("project_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectAdmins_AB_unique" ON "_ProjectAdmins"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectAdmins_B_index" ON "_ProjectAdmins"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectEditors_AB_unique" ON "_ProjectEditors"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectEditors_B_index" ON "_ProjectEditors"("B");
