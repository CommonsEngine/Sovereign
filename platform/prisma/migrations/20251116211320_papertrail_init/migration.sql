-- CreateTable
CREATE TABLE "papertrail_boards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "papertrail_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "position" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "papertrail_nodes_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "papertrail_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "papertrail_edges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "data" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "papertrail_edges_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "papertrail_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "papertrail_boards_project_id_key" ON "papertrail_boards"("project_id");

-- CreateIndex
CREATE INDEX "papertrail_nodes_board_id_idx" ON "papertrail_nodes"("board_id");

-- CreateIndex
CREATE INDEX "papertrail_edges_board_id_idx" ON "papertrail_edges"("board_id");
