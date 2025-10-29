-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'human',
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "picture_url" TEXT,
    "primary_email_id" TEXT,
    "email_verified_at" DATETIME,
    "password_hash" TEXT,
    "is_test_user" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_primary_email_id_fkey" FOREIGN KEY ("primary_email_id") REFERENCES "user_emails" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("created_at", "email_verified_at", "first_name", "id", "last_name", "name", "password_hash", "picture_url", "primary_email_id", "status", "type", "updated_at") SELECT "created_at", "email_verified_at", "first_name", "id", "last_name", "name", "password_hash", "picture_url", "primary_email_id", "status", "type", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_name_key" ON "users"("name");
CREATE UNIQUE INDEX "users_primary_email_id_key" ON "users"("primary_email_id");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "users_email_verified_at_idx" ON "users"("email_verified_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
