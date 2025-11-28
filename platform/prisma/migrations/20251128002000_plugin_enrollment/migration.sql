-- AlterTable
ALTER TABLE "plugins" ADD COLUMN "enroll_strategy" TEXT NOT NULL DEFAULT 'auto';

-- Migrate existing rows: map user_default_enabled=true->auto, false->subscribe
UPDATE "plugins" SET "enroll_strategy" = 'subscribe' WHERE "user_default_enabled" = false;
UPDATE "plugins" SET "enroll_strategy" = 'auto' WHERE "user_default_enabled" IS NULL OR "user_default_enabled" = true;

-- Drop legacy column
ALTER TABLE "plugins" DROP COLUMN "user_default_enabled";
