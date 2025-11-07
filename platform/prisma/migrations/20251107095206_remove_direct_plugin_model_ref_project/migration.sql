/*
  Warnings:

  - You are about to drop the column `blog_id` on the `git_configs` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_blogs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "type" TEXT NOT NULL DEFAULT 'blog:git',
    "provider" TEXT NOT NULL DEFAULT 'astro',
    "domain" TEXT,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "gitConfigId" TEXT,
    CONSTRAINT "blogs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "blogs_gitConfigId_fkey" FOREIGN KEY ("gitConfigId") REFERENCES "git_configs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_blogs" ("created_at", "domain", "id", "meta", "project_id", "provider", "subtitle", "title", "type", "updated_at") SELECT "created_at", "domain", "id", "meta", "project_id", "provider", "subtitle", "title", "type", "updated_at" FROM "blogs";
DROP TABLE "blogs";
ALTER TABLE "new_blogs" RENAME TO "blogs";
CREATE UNIQUE INDEX "blogs_project_id_key" ON "blogs"("project_id");
CREATE UNIQUE INDEX "blogs_domain_key" ON "blogs"("domain");
CREATE TABLE "new_git_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT,
    "provider" TEXT NOT NULL,
    "repo_url" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "content_dir" TEXT,
    "auth_type" TEXT DEFAULT 'ssh',
    "auth_secret" TEXT,
    "meta" JSONB,
    "user_name" TEXT,
    "user_email" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "git_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_git_configs" ("auth_secret", "auth_type", "branch", "content_dir", "created_at", "id", "meta", "provider", "repo_url", "updated_at", "user_email", "user_name") SELECT "auth_secret", "auth_type", "branch", "content_dir", "created_at", "id", "meta", "provider", "repo_url", "updated_at", "user_email", "user_name" FROM "git_configs";
DROP TABLE "git_configs";
ALTER TABLE "new_git_configs" RENAME TO "git_configs";
CREATE UNIQUE INDEX "git_configs_project_id_key" ON "git_configs"("project_id");
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "slug" TEXT,
    "desc" TEXT,
    "type" TEXT NOT NULL,
    "scope" TEXT,
    "status" TEXT DEFAULT 'draft',
    "tenant_id" TEXT DEFAULT 'tenant-0',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("created_at", "desc", "id", "name", "scope", "slug", "status", "tenant_id", "type", "updated_at") SELECT "created_at", "desc", "id", "name", "scope", "slug", "status", "tenant_id", "type", "updated_at" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
