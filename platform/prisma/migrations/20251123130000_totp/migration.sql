-- TOTP support
CREATE TABLE "user_totp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" DATETIME,
    "last_used_at" DATETIME,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "recovery_codes" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_totp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_totp_user_id_key" ON "user_totp"("user_id");
CREATE INDEX "user_totp_user_id_idx" ON "user_totp"("user_id");

CREATE TABLE "totp_pending" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "totp_pending_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "totp_pending_token_key" ON "totp_pending"("token");
CREATE INDEX "totp_pending_user_id_idx" ON "totp_pending"("user_id");
CREATE INDEX "totp_pending_expires_at_idx" ON "totp_pending"("expires_at");
