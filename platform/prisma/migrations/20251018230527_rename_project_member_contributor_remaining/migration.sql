/*
  Warnings:

  - You are about to drop the `project_members` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "project_members";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "project_contributors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT,
    "invited_email" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" DATETIME,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_contributors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "project_contributors_user_id_idx" ON "project_contributors"("user_id");

-- CreateIndex
CREATE INDEX "project_contributors_invited_email_idx" ON "project_contributors"("invited_email");

-- CreateIndex
CREATE UNIQUE INDEX "project_contributors_project_id_user_id_key" ON "project_contributors"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_contributors_project_id_invited_email_key" ON "project_contributors"("project_id", "invited_email");
