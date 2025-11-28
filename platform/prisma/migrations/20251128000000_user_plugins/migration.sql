-- AlterTable
ALTER TABLE "plugins" ADD COLUMN "user_default_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "user_plugins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_plugins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_plugins_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_plugins_user_id_plugin_id_key" ON "user_plugins"("user_id", "plugin_id");

-- CreateIndex
CREATE INDEX "user_plugins_plugin_id_idx" ON "user_plugins"("plugin_id");
