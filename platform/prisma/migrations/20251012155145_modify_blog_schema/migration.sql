/*
  Warnings:

  - Added the required column `title` to the `blogs` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_blogs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "type" TEXT NOT NULL DEFAULT 'blog:git',
    "provider" TEXT NOT NULL DEFAULT 'astro',
    "project_id" TEXT NOT NULL,
    "domain" TEXT,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "blogs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_blogs" ("created_at", "domain", "id", "meta", "project_id", "provider", "type", "updated_at") SELECT "created_at", "domain", "id", "meta", "project_id", "provider", "type", "updated_at" FROM "blogs";
DROP TABLE "blogs";
ALTER TABLE "new_blogs" RENAME TO "blogs";
CREATE UNIQUE INDEX "blogs_project_id_key" ON "blogs"("project_id");
CREATE UNIQUE INDEX "blogs_domain_key" ON "blogs"("domain");
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "slug" TEXT,
    "desc" TEXT,
    "type" TEXT NOT NULL,
    "scope" TEXT,
    "status" TEXT DEFAULT 'draft',
    "user_id" TEXT,
    "tenant_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_projects" ("created_at", "desc", "id", "name", "scope", "slug", "status", "tenant_id", "type", "updated_at", "user_id") SELECT "created_at", "desc", "id", "name", "scope", "slug", "status", "tenant_id", "type", "updated_at", "user_id" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");
CREATE UNIQUE INDEX "projects_user_id_slug_key" ON "projects"("user_id", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
