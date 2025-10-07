import path from "path";

import {
  getGitManager,
  getOrInitGitManager,
} from "../../libs/gitcms/registry.mjs";
import FileManager from "../../libs/gitcms/fs.mjs";
import logger from "../../utils/logger.mjs";
import prisma from "../../prisma.mjs";

const gitcms = {};
export default gitcms;

gitcms.postCreate = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).render("error", {
        code: 401,
        message: "Unauthorized",
        description: "Please sign in to create a post.",
      });
    }

    // Accept either :projectId or :id based on route definition
    const projectId = req.params.projectId || req.params.id;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad request",
        description: "Missing project id",
      });
    }

    // Verify project exists and belongs to the user
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, type: true },
    });
    if (!project) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not found",
        description: "Project not found",
      });
    }
    if (project.ownerId !== userId) {
      return res.status(403).render("error", {
        code: 403,
        message: "Forbidden",
        description:
          "You do not have permission to create posts in this project.",
      });
    }
    if (project.type !== "gitcms") {
      return res.status(400).render("error", {
        code: 400,
        message: "Invalid project type",
        description: "Posts can only be created for GitCMS projects.",
      });
    }

    // Load GitCMS config
    const cfg = await prisma.projectGitCMS.findUnique({
      where: { projectId },
      select: {
        repoUrl: true,
        defaultBranch: true,
        contentDir: true,
        gitUserName: true,
        gitUserEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      // Not configured yet
      return res.redirect(302, `/p/${projectId}/configure`);
    }

    // Ensure git connection (reuse cached manager if available)
    let gm = getGitManager(projectId);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          defaultBranch: cfg.defaultBranch,
          gitUserName: cfg.gitUserName,
          gitUserEmail: cfg.gitUserEmail,
          gitAuthToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("Git connect failed during post creation:", err);
        return res.redirect(302, `/p/${projectId}/configure`);
      }
    }

    // Pull latest to avoid conflicts
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn(
        "Pull latest failed before creating post:",
        err?.message || err,
      );
      // continue; we'll still create locally
    }

    // Build filename (allow optional ?title= or ?name= in query)
    const baseFromQuery =
      (typeof req.query?.name === "string" && req.query.name) ||
      (typeof req.query?.title === "string" && req.query.title) ||
      "Untitled Post";
    const slugBase =
      baseFromQuery
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "untitled";

    const now = new Date();
    const nowIso = now.toISOString();
    const fm = new FileManager(gm.getLocalPath(), cfg.contentDir || "");

    const frontmatter =
      `---\n` +
      `title: "${baseFromQuery.replace(/"/g, '\\"') || "Untitled Post"}"\n` +
      `description: ""\n` +
      `pubDate: ${nowIso}\n` +
      `draft: false\n` +
      `tags: []\n` +
      `updatedDate: ${nowIso}\n` +
      `---\n\n` +
      `Write your post here...\n`;

    // Create unique filename
    let attempt = 0;
    let finalFilename = "";
    while (attempt < 50) {
      const suffix = attempt === 0 ? "" : `-${attempt}`;
      const candidate = `${slugBase}${suffix}.md`;
      try {
        finalFilename = await fm.createFile(candidate, frontmatter);
        break; // success
      } catch (err) {
        if (String(err?.message || "").includes("File already exists")) {
          attempt += 1;
          continue;
        }
        throw err; // other fs error
      }
    }
    if (!finalFilename) {
      return res.status(500).render("error", {
        code: 500,
        message: "Oops!",
        description: "Failed to allocate a filename for the new post.",
      });
    }

    // Commit and push the new post (best-effort)
    try {
      await gm.publish(`Create post: ${finalFilename}`);
    } catch (err) {
      logger.warn("Publish failed after creating post:", err?.message || err);
      // non-fatal; proceed to editor
    }

    // Redirect to edit page for the newly created post
    return res.redirect(
      302,
      `/p/${projectId}/gitcms/post/${encodeURIComponent(finalFilename)}?edit=true`,
    );
  } catch (err) {
    logger.error("Create post flow failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to create a new post",
      error: err?.message || String(err),
    });
  }
};

gitcms.postView = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).render("error", {
        code: 401,
        message: "Unauthorized",
        description: "Please sign in to view this post.",
      });
    }

    // Params
    const projectId = req.params.projectId || req.params.id;
    const rawFilename =
      typeof req.params.postId === "string"
        ? req.params.postId
        : typeof req.params.fp === "string"
          ? req.params.fp
          : "";
    const filename = path.basename(String(rawFilename).trim());
    if (!projectId || !filename || !/\.md$/i.test(filename)) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad request",
        description: "Missing project id or invalid filename.",
      });
    }

    // Verify project and ownership
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, type: true, name: true },
    });
    if (!project) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not found",
        description: "Project not found",
      });
    }
    if (project.ownerId !== userId) {
      return res.status(403).render("error", {
        code: 403,
        message: "Forbidden",
        description: "You do not have permission to view this post.",
      });
    }
    if (project.type !== "gitcms") {
      return res.status(400).render("error", {
        code: 400,
        message: "Invalid project type",
        description: "Posts are only available for GitCMS projects.",
      });
    }

    // Load GitCMS config
    const cfg = await prisma.projectGitCMS.findUnique({
      where: { projectId },
      select: {
        repoUrl: true,
        defaultBranch: true,
        contentDir: true,
        gitUserName: true,
        gitUserEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.redirect(302, `/p/${projectId}/configure`);
    }

    // Ensure git connection
    let gm = getGitManager(projectId);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          defaultBranch: cfg.defaultBranch,
          gitUserName: cfg.gitUserName,
          gitUserEmail: cfg.gitUserEmail,
          gitAuthToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("Git connect failed while opening post:", err);
        return res.redirect(302, `/p/${projectId}/configure`);
      }
    }

    // Pull latest (best effort)
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn(
        "Pull latest failed before opening post:",
        err?.message || err,
      );
    }

    // Read file contents
    const fm = new FileManager(gm.getLocalPath(), cfg.contentDir || "");
    let raw = "";
    try {
      raw = await fm.readFile(filename);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return res.status(404).render("error", {
          code: 404,
          message: "Not found",
          description: "Post not found",
        });
      }
      if (
        String(err?.message || "")
          .toLowerCase()
          .includes("invalid file path")
      ) {
        return res.status(400).render("error", {
          code: 400,
          message: "Bad request",
          description: "Invalid file path",
        });
      }
      logger.error("Failed to read post:", err);
      return res.status(500).render("error", {
        code: 500,
        message: "Oops!",
        description: "Failed to load post file",
        error: err?.message || String(err),
      });
    }

    // Parse basic YAML-like frontmatter (best-effort)
    function parseFrontmatter(src) {
      const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!m) return [{}, src];
      const yaml = m[1];
      const body = m[2] || "";
      const meta = {};
      yaml.split(/\r?\n/).forEach((line) => {
        const i = line.indexOf(":");
        if (i === -1) return;
        const k = line.slice(0, i).trim();
        let v = line.slice(i + 1).trim();
        // strip quotes
        v = v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
        if (/^(true|false)$/i.test(v)) v = /^true$/i.test(v);
        else if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
          const d = new Date(v);
          if (!isNaN(d)) v = d.toISOString();
        } else if (/^\[.*\]$/.test(v)) {
          v = v
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        meta[k] = v;
      });
      return [meta, body];
    }

    const [meta, contentMarkdown] = parseFrontmatter(raw);

    logger.log("Post meta:", meta);
    logger.log("Post contentMarkdown:", contentMarkdown);

    // Render editor template with context
    return res.render("project/gitcms/editor", {
      projectId,
      filename,
      projectName: project.name,
      repoUrl: cfg.repoUrl,
      branch: cfg.defaultBranch,
      contentDir: cfg.contentDir || "",
      meta,
      contentMarkdown,
      contentRawB64: Buffer.from(raw, "utf8").toString("base64"),
      // convenience fields
      title: meta.title || filename.replace(/\.md$/i, ""),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      tagsCsv: Array.isArray(meta.tags)
        ? meta.tags.join(",")
        : typeof meta.tags === "string"
          ? meta.tags
          : "",
      draft: typeof meta.draft === "boolean" ? meta.draft : true,
      pubDate: meta.date || null,
    });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load post",
      error: err?.message || String(err),
    });
  }
};
