/*
  Warnings:

  - You are about to drop the column `createdAt` on the `post_meta` table. All the data in the column will be lost.
  - You are about to drop the column `excerpt` on the `post_meta` table. All the data in the column will be lost.
  - You are about to drop the column `path` on the `post_meta` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `post_meta` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_post_meta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pubDate" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" DATETIME,
    "title" TEXT,
    "description" TEXT,
    "author" TEXT,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "tags" TEXT,
    "draft" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "gitcms_id" TEXT,
    CONSTRAINT "post_meta_gitcms_id_fkey" FOREIGN KEY ("gitcms_id") REFERENCES "ProjectGitCMS" ("project_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_post_meta" ("deletedAt", "draft", "gitcms_id", "id", "pubDate", "tags", "title") SELECT "deletedAt", "draft", "gitcms_id", "id", "pubDate", "tags", "title" FROM "post_meta";
DROP TABLE "post_meta";
ALTER TABLE "new_post_meta" RENAME TO "post_meta";
CREATE INDEX "post_meta_gitcms_id_idx" ON "post_meta"("gitcms_id");
CREATE UNIQUE INDEX "post_meta_gitcms_id_key" ON "post_meta"("gitcms_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- CreateIndex
CREATE INDEX "app_settings_scope_idx" ON "app_settings"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_scope_key_key" ON "app_settings"("scope", "key");
