-- CreateTable
CREATE TABLE "papertrail_boards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "schema_version" INTEGER NOT NULL,
    "layout" TEXT,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "user_id" TEXT,
    CONSTRAINT "papertrail_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "papertrail_boards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "papertrail_nodes" (
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
    "meta" JSONB,
    CONSTRAINT "papertrail_nodes_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "papertrail_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "papertrail_edges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "label" TEXT,
    "dashed" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    CONSTRAINT "papertrail_edges_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "papertrail_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "papertrail_node_tags" (
    "node_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("node_id", "tag_id"),
    CONSTRAINT "papertrail_node_tags_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "papertrail_nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "papertrail_node_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "papertrail_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "papertrail_attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "file_key" TEXT,
    "name" TEXT,
    "size_bytes" INTEGER,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_profiles" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "locale" TEXT,
    "timezone" TEXT,
    "meta" JSONB,
    CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_profiles" ("locale", "meta", "timezone", "user_id") SELECT "locale", "meta", "timezone", "user_id" FROM "user_profiles";
DROP TABLE "user_profiles";
ALTER TABLE "new_user_profiles" RENAME TO "user_profiles";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "papertrail_boards_project_id_key" ON "papertrail_boards"("project_id");

-- CreateIndex
CREATE INDEX "papertrail_boards_created_at_idx" ON "papertrail_boards"("created_at");

-- CreateIndex
CREATE INDEX "papertrail_nodes_board_id_idx" ON "papertrail_nodes"("board_id");

-- CreateIndex
CREATE INDEX "papertrail_nodes_board_id_type_idx" ON "papertrail_nodes"("board_id", "type");

-- CreateIndex
CREATE INDEX "papertrail_edges_board_id_idx" ON "papertrail_edges"("board_id");

-- CreateIndex
CREATE INDEX "papertrail_edges_board_id_source_id_idx" ON "papertrail_edges"("board_id", "source_id");

-- CreateIndex
CREATE INDEX "papertrail_edges_board_id_target_id_idx" ON "papertrail_edges"("board_id", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "papertrail_node_tags_node_id_idx" ON "papertrail_node_tags"("node_id");

-- CreateIndex
CREATE INDEX "papertrail_node_tags_tag_id_idx" ON "papertrail_node_tags"("tag_id");

-- CreateIndex
CREATE INDEX "papertrail_comments_project_id_entity_id_idx" ON "papertrail_comments"("project_id", "entity_id");

-- CreateIndex
CREATE INDEX "papertrail_attachment_project_id_node_id_idx" ON "papertrail_attachment"("project_id", "node_id");
