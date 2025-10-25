-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "slug" TEXT,
    "desc" TEXT,
    "type" TEXT NOT NULL,
    "scope" TEXT,
    "status" TEXT,
    "user_id" TEXT,
    "tenant_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "blogs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'blog:git',
    "provider" TEXT NOT NULL DEFAULT 'astro',
    "project_id" TEXT NOT NULL,
    "domain" TEXT,
    "meta" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "blogs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "git_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blog_id" TEXT,
    "provider" TEXT NOT NULL,
    "repo_url" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "content_dir" TEXT,
    "auth_type" TEXT DEFAULT 'ssh',
    "auth_secret" TEXT,
    "meta" JSONB,
    "user_name" TEXT,
    "user_email" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "git_configs_blog_id_fkey" FOREIGN KEY ("blog_id") REFERENCES "blogs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_user_id_slug_key" ON "projects"("user_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "blogs_project_id_key" ON "blogs"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "blogs_domain_key" ON "blogs"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "git_configs_blog_id_key" ON "git_configs"("blog_id");
