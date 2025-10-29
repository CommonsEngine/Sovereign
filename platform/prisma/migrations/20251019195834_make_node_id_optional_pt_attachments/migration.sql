-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_papertrail_attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "node_id" TEXT,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "file_key" TEXT,
    "name" TEXT,
    "size_bytes" INTEGER,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_papertrail_attachment" ("created_at", "file_key", "id", "kind", "meta", "name", "node_id", "project_id", "size_bytes", "url") SELECT "created_at", "file_key", "id", "kind", "meta", "name", "node_id", "project_id", "size_bytes", "url" FROM "papertrail_attachment";
DROP TABLE "papertrail_attachment";
ALTER TABLE "new_papertrail_attachment" RENAME TO "papertrail_attachment";
CREATE INDEX "papertrail_attachment_project_id_node_id_idx" ON "papertrail_attachment"("project_id", "node_id");
CREATE TABLE "new_papertrail_boards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "layout" TEXT,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "user_id" TEXT,
    CONSTRAINT "papertrail_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "papertrail_boards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_papertrail_boards" ("created_at", "id", "layout", "meta", "project_id", "schema_version", "title", "updated_at", "user_id") SELECT "created_at", "id", "layout", "meta", "project_id", "schema_version", "title", "updated_at", "user_id" FROM "papertrail_boards";
DROP TABLE "papertrail_boards";
ALTER TABLE "new_papertrail_boards" RENAME TO "papertrail_boards";
CREATE UNIQUE INDEX "papertrail_boards_project_id_key" ON "papertrail_boards"("project_id");
CREATE INDEX "papertrail_boards_created_at_idx" ON "papertrail_boards"("created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
