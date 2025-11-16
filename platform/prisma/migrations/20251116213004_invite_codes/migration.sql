-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code_hmac" TEXT NOT NULL,
    "code_preview" TEXT,
    "tenant_id" TEXT,
    "project_id" TEXT,
    "role_key" TEXT NOT NULL,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" DATETIME,
    "revoked_at" DATETIME,
    "allowed_email" TEXT,
    "allowed_domain" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "invite_uses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invite_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invite_uses_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "invites" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "invites_code_hmac_key" ON "invites"("code_hmac");

-- CreateIndex
CREATE INDEX "invites_tenant_id_idx" ON "invites"("tenant_id");

-- CreateIndex
CREATE INDEX "invites_project_id_idx" ON "invites"("project_id");

-- CreateIndex
CREATE INDEX "invite_uses_invite_id_idx" ON "invite_uses"("invite_id");

-- CreateIndex
CREATE UNIQUE INDEX "invite_uses_invite_id_user_id_key" ON "invite_uses"("invite_id", "user_id");
