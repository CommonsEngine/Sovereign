-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "roles" JSONB,
    "capabilities" JSONB,
    "user_snapshot" JSONB,
    "capabilities_signature" TEXT,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_sessions" ("capabilities", "created_at", "expires_at", "id", "ip_hash", "roles", "token", "user_agent", "user_id", "user_snapshot") SELECT "capabilities", "created_at", "expires_at", "id", "ip_hash", "roles", "token", "user_agent", "user_id", "user_snapshot" FROM "sessions";
DROP TABLE "sessions";
ALTER TABLE "new_sessions" RENAME TO "sessions";
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_token_idx" ON "sessions"("token");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE TABLE "new_user_capabilities" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "source" TEXT,
    "namespace" TEXT,
    "scope" TEXT,
    "category" TEXT,
    "tags" JSONB,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_user_capabilities" ("description", "key") SELECT "description", "key" FROM "user_capabilities";
DROP TABLE "user_capabilities";
ALTER TABLE "new_user_capabilities" RENAME TO "user_capabilities";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
