-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_papertrail_boards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "layout" TEXT,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_papertrail_boards" ("created_at", "id", "layout", "meta", "project_id", "schema_version", "title", "updated_at") SELECT "created_at", "id", "layout", "meta", "project_id", "schema_version", "title", "updated_at" FROM "papertrail_boards";
DROP TABLE "papertrail_boards";
ALTER TABLE "new_papertrail_boards" RENAME TO "papertrail_boards";
CREATE UNIQUE INDEX "papertrail_boards_project_id_key" ON "papertrail_boards"("project_id");
CREATE INDEX "papertrail_boards_created_at_idx" ON "papertrail_boards"("created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
