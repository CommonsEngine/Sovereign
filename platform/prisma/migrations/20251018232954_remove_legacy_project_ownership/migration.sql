/*
  Warnings:

  - You are about to drop the column `user_id` on the `projects` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "slug" TEXT,
    "desc" TEXT,
    "type" TEXT NOT NULL,
    "scope" TEXT,
    "status" TEXT DEFAULT 'draft',
    "tenant_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("created_at", "desc", "id", "name", "scope", "slug", "status", "tenant_id", "type", "updated_at") SELECT "created_at", "desc", "id", "name", "scope", "slug", "status", "tenant_id", "type", "updated_at" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
