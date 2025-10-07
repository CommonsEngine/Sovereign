-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "email_verified_at" DATETIME,
    "display_name" TEXT,
    "username" TEXT NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 9,
    "password_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("created_at", "display_name", "email", "email_verified_at", "id", "password_hash", "role", "status", "updated_at", "username") SELECT "created_at", "display_name", "email", "email_verified_at", "id", "password_hash", "role", "status", "updated_at", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "users_email_verified_at_idx" ON "users"("email_verified_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
