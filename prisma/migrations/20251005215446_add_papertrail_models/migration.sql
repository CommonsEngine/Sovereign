/*
  Warnings:

  - You are about to drop the column `bg_color` on the `ProjectPaperTrail` table. All the data in the column will be lost.
  - You are about to drop the column `height` on the `ProjectPaperTrail` table. All the data in the column will be lost.
  - You are about to drop the column `width` on the `ProjectPaperTrail` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slug]` on the table `projects` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "projects" ADD COLUMN "slug" TEXT;

-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER,
    "h" INTEGER,
    "title" TEXT,
    "text" TEXT,
    "html" TEXT,
    "desc_html" TEXT,
    "link_url" TEXT,
    "image_url" TEXT,
    CONSTRAINT "nodes_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "ProjectPaperTrail" ("project_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "edges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "label" TEXT,
    "dashed" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    CONSTRAINT "edges_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "ProjectPaperTrail" ("project_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "node_tags" (
    "node_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("node_id", "tag_id"),
    CONSTRAINT "node_tags_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "node_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectPaperTrail" (
    "project_id" TEXT NOT NULL PRIMARY KEY,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProjectPaperTrail_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectPaperTrail" ("project_id") SELECT "project_id" FROM "ProjectPaperTrail";
DROP TABLE "ProjectPaperTrail";
ALTER TABLE "new_ProjectPaperTrail" RENAME TO "ProjectPaperTrail";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "nodes_board_id_idx" ON "nodes"("board_id");

-- CreateIndex
CREATE INDEX "nodes_board_id_type_idx" ON "nodes"("board_id", "type");

-- CreateIndex
CREATE INDEX "edges_board_id_idx" ON "edges"("board_id");

-- CreateIndex
CREATE INDEX "edges_board_id_source_id_idx" ON "edges"("board_id", "source_id");

-- CreateIndex
CREATE INDEX "edges_board_id_target_id_idx" ON "edges"("board_id", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "node_tags_node_id_idx" ON "node_tags"("node_id");

-- CreateIndex
CREATE INDEX "node_tags_tag_id_idx" ON "node_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_id_idx" ON "projects"("id");
