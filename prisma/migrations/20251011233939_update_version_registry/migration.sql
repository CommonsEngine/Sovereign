/*
  Warnings:

  - You are about to drop the `VersionRegistry` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VersionRegistry";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "version_registry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "v" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);
