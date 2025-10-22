import path from "path";

import { prisma } from "$/services/database.mjs";
import {
  getGitManager,
  getOrInitGitManager,
  disposeGitManager,
} from "$/libs/git/registry.mjs";
import FileManager from "$/libs/fs.mjs";
import logger from "$/utils/logger.mjs";
import {
  ensureProjectAccess,
  ProjectAccessError,
} from "$/utils/projectAccess.mjs";

const PAPERTRAIL_BOARD_SELECT = {
  id: true,
  projectId: true,
  title: true,
  schemaVersion: true,
  layout: true,
  meta: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      nodes: true,
      edges: true,
    },
  },
};

const DEFAULT_SELECT = {
  id: true,
  name: true,
  desc: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  blog: {
    select: {
      id: true,
      projectId: true,
      gitConfig: {
        select: {
          repoUrl: true,
          branch: true,
          contentDir: true,
          userName: true,
          userEmail: true,
        },
      },
    },
  },
  papertrail: {
    select: PAPERTRAIL_BOARD_SELECT,
  },
};

async function getProjectAccessContext(req, projectId, options = {}) {
  const { select = DEFAULT_SELECT, roles = ["viewer"] } = options;
  return ensureProjectAccess({
    projectId,
    user: req.user,
    allowedRoles: roles,
    select,
  });
}

async function getBlogProjectAccess(req, res, projectId, options = {}) {
  const {
    roles = ["editor"],
    select = {
      id: true,
      type: true,
      name: true,
      blog: { select: { id: true } },
    },
    responseType = "html",
  } = options;

  try {
    return await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: roles,
      select,
    });
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      const status = err.status ?? 403;
      if (responseType === "json") {
        res.status(status).json({ error: err.message });
      } else {
        const message =
          status === 404
            ? "Not found"
            : status === 400
              ? "Bad request"
              : "Forbidden";
        const description =
          status === 404
            ? "Project not found"
            : status === 400
              ? err.message || "Invalid request."
              : "You do not have permission to access this project.";
        res.status(status).render("error", {
          code: status,
          message,
          description,
        });
      }
      return null;
    }
    throw err;
  }
}

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseFrontmatter(src) {
  const text = String(src || "");
  const match = text.match(FRONTMATTER_REGEX);
  if (!match) return [{}, text];
  const yaml = match[1];
  const body = match[2] || "";
  const meta = {};
  yaml.split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i === -1) return;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (/^(true|false)$/i.test(value)) {
      value = /^true$/i.test(value);
    } else if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const dt = new Date(value);
      if (!Number.isNaN(dt.getTime())) value = dt.toISOString();
    } else if (/^\[.*\]$/.test(value)) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    meta[key] = value;
  });
  return [meta, body];
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function makeExcerpt(body, limit = 140) {
  if (!body) return "";
  return (
    String(body)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      // eslint-disable-next-line no-useless-escape
      .replace(/[#>*_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit)
  );
}

export async function viewPostEdit(req, res) {
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

    const access = await getBlogProjectAccess(req, res, projectId, {
      roles: ["owner", "editor"],
    });
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).render("error", {
        code: 400,
        message: "Invalid project type",
        description: "Posts are only available for blog projects.",
      });
    }

    // Load Blog config
    const cfg = await prisma.gitConfig.findUnique({
      where: { blogId: project.blog.id },
      select: {
        repoUrl: true,
        branch: true,
        contentDir: true,
        userName: true,
        userEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.redirect(302, `/${project.type}/${projectId}/configure`);
    }

    // Ensure git connection
    let gm = getGitManager(projectId);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          branch: cfg.branch,
          userName: cfg.userName,
          userEmail: cfg.userEmail,
          authToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("Git connect failed while opening post:", err);
        return res.redirect(302, `/${project.type}/${projectId}/configure`);
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

    const [meta, contentMarkdown] = parseFrontmatter(raw);

    console.log("Rendering editor for post:", meta);

    // Render editor template with context
    return res.render("blog/editor", {
      projectId,
      filename,
      projectName: project.name,
      repoUrl: cfg.repoUrl,
      branch: cfg.branch,
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
}

export async function getAllPosts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // 1) Fetch project id from URL params
    const projectId = req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const access = await getBlogProjectAccess(req, res, projectId, {
      roles: ["viewer"],
      responseType: "json",
    });
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).json({ error: "Unsupported project type" });
    }

    // 2) Fetch blog config by project id
    const cfg = await prisma.gitConfig.findUnique({
      where: { blogId: project.blog.id },
      select: {
        repoUrl: true,
        branch: true,
        contentDir: true,
        userName: true,
        userEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.status(400).json({ error: "Invalid blog configuration" });
    }

    // 3) Fetch posts using GitManager from repo working directory
    let gm = getGitManager(projectId);
    if (!gm) {
      gm = await getOrInitGitManager(projectId, {
        repoUrl: cfg.repoUrl,
        branch: cfg.branch,
        userName: cfg.userName,
        userEmail: cfg.userEmail,
        authToken: cfg.authSecret || null,
      });
    }
    // Ensure latest before reading
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn(
        "Failed to pull latest before listing posts:",
        err?.message || err,
      );
      // continue to read local working tree
    }

    const basePath = gm.getLocalPath();
    const fm = new FileManager(basePath, cfg.contentDir || "");
    const files = await fm.listMarkdownFiles();

    const posts = await Promise.all(
      files.map(async (file) => {
        let raw = "";
        let meta = {};
        let body = "";
        try {
          raw = await fm.readFile(file.filename);
          [meta, body] = parseFrontmatter(raw);
        } catch (err) {
          logger.warn(
            `Failed to parse frontmatter for ${file.filename}: ${err?.message || err}`,
          );
        }

        const tags = normalizeTags(meta.tags);
        const draft = meta.draft === true;
        const status = draft ? "Draft" : "Published";
        const modifiedISO =
          file.modified instanceof Date
            ? file.modified.toISOString()
            : file.modified || "";

        return {
          filename: file.filename,
          title:
            typeof meta.title === "string" && meta.title.trim()
              ? meta.title.trim()
              : file.filename.replace(/\.md$/i, ""),
          description:
            typeof meta.description === "string" ? meta.description : "",
          tags,
          status,
          draft,
          pubDate: typeof meta.pubDate === "string" ? meta.pubDate : null,
          updatedDate:
            typeof meta.updatedDate === "string" ? meta.updatedDate : null,
          modified: modifiedISO,
          size: file.size,
          excerpt: makeExcerpt(body),
        };
      }),
    );

    return res.status(200).json({ posts });
  } catch (e) {
    logger.error("List blog posts failed:", e);
    return res.status(500).json({ error: "Failed to list posts" });
  }
}

export async function updatePost(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Project id
    const projectId = req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    // Filename (route param preferred), and content (markdown)
    const rawName =
      (typeof req.params?.fp === "string" && req.params.fp) ||
      (typeof req.body?.fp === "string" && req.body.fp) ||
      "";
    const filename = path.basename(String(rawName).trim());
    if (!filename || !/\.md$/i.test(filename)) {
      return res
        .status(400)
        .json({ error: "Invalid filename. Expected a .md file." });
    }

    // Validate payload: content + optional meta fields
    const incoming =
      typeof req.body?.contentMarkdown === "string"
        ? req.body.contentMarkdown
        : typeof req.body?.content === "string"
          ? req.body.content
          : null;
    if (incoming == null) {
      return res.status(400).json({ error: "Missing content" });
    }
    if (typeof incoming !== "string") {
      return res.status(400).json({ error: "Invalid content" });
    }

    // Normalize meta updates (only apply provided keys)
    const updates = {};
    if (typeof req.body?.title === "string")
      updates.title = req.body.title.trim().slice(0, 300);
    if (typeof req.body?.description === "string")
      updates.description = req.body.description.trim();
    if (typeof req.body?.coverUrl === "string")
      updates.coverUrl = req.body.coverUrl.trim();
    else if (req.body?.coverUrl === null) updates.coverUrl = "";

    if (typeof req.body?.pubDate === "string") {
      updates.pubDate = new Date(req.body.pubDate).toISOString();

      const d = new Date();
      updates.updatedDate = d.toISOString();
    }

    if (typeof req.body?.draft === "boolean") updates.draft = req.body.draft;
    else if (typeof req.body?.draft === "string")
      updates.draft = req.body.draft.toLowerCase() === "true";

    if (Array.isArray(req.body?.tags))
      updates.tags = req.body.tags.map((t) => String(t).trim()).filter(Boolean);
    else if (typeof req.body?.tags === "string")
      updates.tags = req.body.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const access = await getBlogProjectAccess(req, res, projectId, {
      roles: ["owner", "editor"],
      responseType: "json",
    });
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).json({ error: "Project is not a blog type" });
    }

    // Load config
    const cfg = await prisma.gitConfig.findUnique({
      where: { blogId: project.blog.id },
      select: {
        repoUrl: true,
        branch: true,
        contentDir: true,
        userName: true,
        userEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.status(400).json({ error: "Blog is not configured" });
    }

    // Ensure Git working directory exists (no commit/push here)
    let gm = getGitManager(projectId);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          branch: cfg.branch,
          userName: cfg.userName,
          userEmail: cfg.userEmail,
          authToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("Git manager init failed during update:", err);
        return res.status(400).json({
          error:
            "Failed to access repository. Please verify the configuration.",
        });
      }
    }

    const fm = new FileManager(gm.getLocalPath(), cfg.contentDir || "");

    // Helper: split frontmatter
    const splitFrontmatter = (src) => {
      const m = String(src || "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!m) return { has: false, fm: "", body: src || "" };
      return { has: true, fm: m[1], body: m[2] || "" };
    };
    const hasFrontmatter = (src) => /^---\n[\s\S]*?\n---\n?/.test(src || "");
    const yamlQuote = (v) => `"${String(v ?? "").replace(/"/g, '\\"')}"`;
    const renderTags = (val) => {
      const arr = Array.isArray(val)
        ? val
        : typeof val === "string"
          ? val
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      return `[${arr.map((t) => yamlQuote(t)).join(", ")}]`;
    };
    // Preserve order/unknown keys, update only provided ones
    const updateFrontmatter = (fmText, changes) => {
      const lines = String(fmText || "").split(/\r?\n/);
      const set = new Set();
      const apply = (k, v) => {
        if (k === "tags") return `${k}: ${renderTags(v)}`;
        if (k === "draft") return `${k}: ${v ? "true" : "false"}`;
        if (k === "pubDate" || k === "updatedDate") {
          const d = new Date(v);
          return `${k}: ${!Number.isNaN(d.getTime()) ? d.toISOString() : ""}`;
        }
        return `${k}: ${yamlQuote(v)}`;
      };
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        if (!(k in changes)) continue;
        lines[i] = apply(k, changes[k]);
        set.add(k);
      }
      // Append any missing provided keys at the end
      for (const k of Object.keys(changes)) {
        if (set.has(k)) continue;
        lines.push(apply(k, changes[k]));
      }
      return lines.join("\n");
    };

    // Read existing file to preserve structure
    let originalRaw = "";
    try {
      originalRaw = await fm.readFile(filename);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return res.status(404).json({ error: "Post not found" });
      }
      if (
        String(err?.message || "")
          .toLowerCase()
          .includes("invalid file path")
      ) {
        return res.status(400).json({ error: "Invalid file path" });
      }
      logger.error("Failed to read existing file:", err);
      return res.status(500).json({ error: "Failed to read existing file" });
    }

    // If client sent a full file (frontmatter present), write as-is
    let finalText = incoming;
    if (!hasFrontmatter(incoming)) {
      // Compose from original structure
      const parts = splitFrontmatter(originalRaw);
      if (parts.has) {
        // Update frontmatter with provided meta only, replace body with incoming content
        const fmUpdated =
          Object.keys(updates).length > 0
            ? updateFrontmatter(parts.fm, updates)
            : parts.fm;
        finalText = `---\n${fmUpdated}\n---\n\n${incoming || ""}`;
      } else {
        // Original had no frontmatter: preserve structure (no frontmatter)
        finalText = incoming || "";
      }
    }

    // Save file content
    try {
      await fm.updateFile(filename, finalText);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return res.status(404).json({ error: "Post not found" });
      }
      if (
        String(err?.message || "")
          .toLowerCase()
          .includes("invalid file path")
      ) {
        return res.status(400).json({ error: "Invalid file path" });
      }
      logger.error("Update file failed:", err);
      return res.status(500).json({ error: "Failed to update file" });
    }

    const [latestMetaRaw] = parseFrontmatter(finalText);
    const latestMeta = {
      title:
        typeof latestMetaRaw.title === "string"
          ? latestMetaRaw.title.trim()
          : (updates.title ?? ""),
      description:
        typeof latestMetaRaw.description === "string"
          ? latestMetaRaw.description
          : (updates.description ?? ""),
      tags: normalizeTags(latestMetaRaw.tags),
      draft: latestMetaRaw.draft === true,
      coverUrl:
        typeof latestMetaRaw.coverUrl === "string"
          ? latestMetaRaw.coverUrl
          : (updates.coverUrl ?? ""),
      pubDate:
        typeof latestMetaRaw.pubDate === "string"
          ? latestMetaRaw.pubDate
          : (updates.pubDate ?? null),
      updatedDate:
        typeof latestMetaRaw.updatedDate === "string"
          ? latestMetaRaw.updatedDate
          : (updates.updatedDate ?? null),
    };

    let resultingFilename = filename;

    // Handle slug/path rename AFTER saving content
    try {
      const desiredPathRaw =
        typeof req.body?.path === "string" ? req.body.path.trim() : "";
      let desiredBase = desiredPathRaw ? path.basename(desiredPathRaw) : "";

      if (desiredBase) {
        // Ensure .md
        if (!/\.md$/i.test(desiredBase)) desiredBase = `${desiredBase}.md`;
        // If different, attempt rename
        if (desiredBase !== filename) {
          const fs = await import("node:fs/promises");
          const basePath = gm.getLocalPath();
          const relDir = (cfg.contentDir || "").trim();
          const oldFsPath = path.join(basePath, relDir || "", filename);
          const newFsPath = path.join(basePath, relDir || "", desiredBase);

          // Prevent overwrite
          let exists = false;
          try {
            await fs.access(newFsPath);
            exists = true;
          } catch {
            exists = false;
          }
          if (exists) {
            return res
              .status(409)
              .json({ error: "A post with that slug already exists." });
          }

          await fs.rename(oldFsPath, newFsPath);

          logger.log(`Renamed post ${filename} -> ${desiredBase}`);

          resultingFilename = desiredBase;
          const redirectUrl = `/p/${encodeURIComponent(
            projectId,
          )}/blog/post/${encodeURIComponent(desiredBase)}?edit=true`;
          const relativeDir = (cfg.contentDir || "").trim();
          const finalPath = relativeDir
            ? `${relativeDir}/${desiredBase}`
            : desiredBase;

          return res.status(200).json({
            updated: true,
            renamed: true,
            filename: desiredBase,
            path: finalPath,
            redirect: redirectUrl,
            meta: latestMeta,
          });
        }
      }
    } catch (err) {
      logger.error("Rename after update failed:", err);
      // Fall through to normal success if rename failed silently
    }

    const relativeDir = (cfg.contentDir || "").trim();
    const finalPath = relativeDir
      ? `${relativeDir}/${resultingFilename}`
      : resultingFilename;

    // Normal success (no rename)
    return res.status(200).json({
      updated: true,
      filename: resultingFilename,
      path: finalPath,
      meta: latestMeta,
    });
  } catch (err) {
    logger.error("Update Blog post failed:", err);
    return res.status(500).json({ error: "Failed to update post" });
  }
}

export async function deletePost(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Project id
    const projectId = req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    // File name (from route param, body, or query)
    const rawName =
      (typeof req.params?.fp === "string" && req.params.fp) ||
      (typeof req.body?.fp === "string" && req.body.fp) ||
      (typeof req.query?.fp === "string" && req.query.fp) ||
      "";
    const filename = path.basename(String(rawName).trim());
    if (!filename || !/\.md$/i.test(filename)) {
      return res
        .status(400)
        .json({ error: "Invalid filename. Expected a .md file." });
    }

    // Verify ownership and type
    const access = await getBlogProjectAccess(req, res, projectId, {
      roles: ["owner", "editor"],
      responseType: "json",
    });
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).json({ error: "Unsupported project type" });
    }

    // Load config
    const cfg = await prisma.gitConfig.findUnique({
      where: { blogId: project.blog.id },
      select: {
        repoUrl: true,
        branch: true,
        contentDir: true,
        userName: true,
        userEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.status(400).json({ error: "Blog is not configured" });
    }

    // Ensure Git connection
    let gm = getGitManager(projectId);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          branch: cfg.branch,
          userName: cfg.userName,
          userEmail: cfg.userEmail,
          authToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("Git connect failed during delete:", err);
        return res.status(400).json({
          error:
            "Failed to connect to repository. Please verify the configuration.",
        });
      }
    }

    // Best-effort pull to reduce conflicts
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn("Pull latest failed before deletion:", err?.message || err);
    }

    // Delete file via FileManager
    const fm = new FileManager(gm.getLocalPath(), cfg.contentDir || "");
    try {
      await fm.deleteFile(filename);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return res.status(404).json({ error: "Post not found" });
      }
      if (
        String(err?.message || "")
          .toLowerCase()
          .includes("invalid file path")
      ) {
        return res.status(400).json({ error: "Invalid file path" });
      }
      logger.error("Delete file failed:", err);
      return res.status(500).json({ error: "Failed to delete file" });
    }

    // Commit and push
    let pushed = true;
    let publishError = null;
    try {
      await gm.publish(`Delete post: ${filename}`);
    } catch (err) {
      pushed = false;
      publishError = err;
      logger.warn("Publish failed after deletion:", err?.message || err);
    }

    const responsePayload = { deleted: true, filename, pushed };
    if (!pushed && publishError) {
      const msg = String(publishError?.message || publishError);
      if (/non-fast-forward|fetch first|rejected/i.test(msg)) {
        responsePayload.hint =
          "Remote has new commits. Pull/rebase locally then retry publish.";
      }
      responsePayload.error = "Repository push failed";
      responsePayload.detail = msg;
      return res.status(202).json(responsePayload);
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    logger.error("Delete Blog post failed:", err);
    return res.status(500).json({ error: "Failed to delete post" });
  }
}

export async function publishPost(req, res) {
  // We need to simply commit and push any changes that are currently in the working directory
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const projectId = req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const access = await getBlogProjectAccess(req, res, projectId, {
      roles: ["owner", "editor"],
      responseType: "json",
    });
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).json({ error: "Project is not a blog type" });
    }

    // Load config to init manager if needed
    const cfg = await prisma.gitConfig.findUnique({
      where: { blogId: project.blog.id },
      select: {
        repoUrl: true,
        branch: true,
        contentDir: true,
        userName: true,
        userEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.status(400).json({ error: "Blog is not configured" });
    }

    // Ensure Git manager
    let gm = getGitManager(projectId);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          branch: cfg.branch,
          userName: cfg.userName,
          userEmail: cfg.userEmail,
          authToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("Git connect failed during publish:", err);
        return res.status(400).json({
          error:
            "Failed to connect to repository. Please verify the configuration.",
        });
      }
    }

    // Best-effort pull to reduce push conflicts
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn("Pull latest failed before publish:", err?.message || err);
      // continue; publish may still succeed if fast-forward
    }

    const rawMsg =
      typeof req.body?.message === "string" ? req.body.message : null;
    const commitMessage = (rawMsg || "Update with Sovereign")
      .toString()
      .trim()
      .slice(0, 200);

    const result = await gm.publish(commitMessage);

    // Normalize response
    if (result && result.message && /No changes/i.test(result.message)) {
      return res
        .status(200)
        .json({ published: false, message: result.message });
    }

    return res.status(200).json({
      published: true,
      message: result?.message || "Changes published successfully",
    });
  } catch (err) {
    logger.error("Publish Blog changes failed:", err);
    // Common non-fast-forward hint
    const msg = String(err?.message || err);
    const nonFastForward = /non-fast-forward|fetch first|rejected/i.test(msg);
    const hint = nonFastForward
      ? "Remote has new commits. Pull/rebase then try again."
      : undefined;
    return res.status(nonFastForward ? 409 : 500).json({
      error: "Failed to publish changes",
      hint,
      detail: msg,
    });
  }
}

export async function viewPostCreate(req, res) {
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
    const access = await getBlogProjectAccess(req, res, projectId, {
      roles: ["owner", "editor"],
    });
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).render("error", {
        code: 400,
        message: "Invalid project type",
        description: "Posts can only be created for Blog projects.",
      });
    }

    // Load Blog config
    const cfg = await prisma.gitConfig.findUnique({
      where: { blogId: project.blog.id },
      select: {
        repoUrl: true,
        branch: true,
        contentDir: true,
        userName: true,
        userEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      // Not configured yet
      return res.redirect(302, `/${project.type}/${projectId}/configure`);
    }

    // Ensure git connection (reuse cached manager if available)
    let gm = getGitManager(projectId);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          branch: cfg.branch,
          userName: cfg.userName,
          userEmail: cfg.userEmail,
          authToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("Git connect failed during post creation:", err);
        return res.redirect(302, `/${project.type}/${projectId}/configure`);
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
      `/p/${projectId}/blog/post/${encodeURIComponent(finalFilename)}?edit=true`,
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
}

export async function retryConnection(req, res) {
  try {
    const projectId = req.params?.id || req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    const access = await getBlogProjectAccess(req, res, projectId, {
      roles: ["owner", "editor"],
      responseType: "json",
      select: {
        type: true,
        blog: {
          select: {
            id: true,
            gitConfig: {
              select: {
                repoUrl: true,
                branch: true,
                contentDir: true,
                userName: true,
                userEmail: true,
                authSecret: true,
              },
            },
          },
        },
      },
    });
    if (!access) return;
    const project = access.project;

    if (!project || project.type !== "blog") {
      return res.status(404).json({ error: "Project not found" });
    }

    const cfg = project.blog?.gitConfig;
    if (!cfg) {
      return res.status(400).json({ error: "Blog configuration is missing." });
    }

    disposeGitManager(projectId);
    await getOrInitGitManager(projectId, {
      repoUrl: cfg.repoUrl,
      branch: cfg.branch,
      userName: cfg.userName,
      userEmail: cfg.userEmail,
      authToken: cfg.authSecret || null,
    });

    return res.json({ connected: true });
  } catch (err) {
    logger.error("Retry blog connection failed:", err);
    return res.status(500).json({ error: "Failed to reconnect" });
  }
}

export async function viewProjectConfigure(req, res) {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad Request",
        description: "Missing project id",
      });
    }

    let access;
    try {
      access = await getProjectAccessContext(req, projectId, {
        roles: ["owner"],
        select: {
          id: true,
          name: true,
          type: true,
          blog: {
            select: {
              id: true,
              projectId: true,
              gitConfig: {
                select: {
                  repoUrl: true,
                  branch: true,
                  contentDir: true,
                  userName: true,
                  userEmail: true,
                },
              },
            },
          },
        },
      });
    } catch (err) {
      if (err?.name === "ProjectAccessError") {
        const status = err.status ?? 403;
        const message =
          status === 404
            ? "Not Found"
            : status === 400
              ? "Bad Request"
              : "Forbidden";
        const description =
          status === 404
            ? "Project not found"
            : status === 400
              ? err.message || "Invalid request"
              : "You do not have access to this project";
        return res.status(status).render("error", {
          code: status,
          message,
          description,
        });
      }
      throw err;
    }

    const project = access.project;

    // Only blogs have configuration flow. If already configured or not a blog, redirect to project.
    const alreadyConfigured = !!project.blog?.gitConfig;
    if (project.type !== "blog" || alreadyConfigured) {
      return res.redirect(302, `/p/${project.id}`);
    }

    return res.render("blog/configure", {
      project,
      gitConfig: project.blog?.gitConfig || null,
    });
  } catch (err) {
    logger.error("Load project configure failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load configuration",
      error: err?.message || String(err),
    });
  }
}

export async function configureProject(req, res) {
  try {
    const projectId = req.params.id;
    logger.log("Configuring blog for project: >>", projectId);
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const blog = await prisma.blog.findUnique({
      where: { projectId },
      select: {
        id: true,
        projectId: true,
        gitConfig: true,
        project: { select: { id: true } },
      },
    });

    if (!blog) {
      return res.status(404).json({ error: "Unsupported project type" });
    }
    if (blog?.gitConfig) {
      return res.status(400).json({ error: "Blog already configured" });
    }

    await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["owner"],
    });

    const raw = req.body || {};

    const repoUrl = String(raw.repoUrl || "").trim();
    if (!repoUrl)
      return res.status(400).json({ error: "Repository URL is required" });

    const branch = (
      String(raw.branch || raw.defaultBranch || "main").trim() || "main"
    ).slice(0, 80);
    const contentDirRaw =
      typeof raw.contentDir === "string" ? raw.contentDir : "";
    const contentDir = contentDirRaw.trim().slice(0, 200) || null;
    const gitUserName =
      typeof raw.gitUserName === "string"
        ? raw.gitUserName.trim().slice(0, 120)
        : null;
    const gitUserEmail =
      typeof raw.gitUserEmail === "string"
        ? raw.gitUserEmail.trim().slice(0, 120)
        : null;
    const gitAuthToken =
      typeof raw.gitAuthToken === "string" ? raw.gitAuthToken.trim() : null;

    // 1) Validate by connecting once and prime the in-memory connection
    try {
      await getOrInitGitManager(projectId, {
        repoUrl,
        branch,
        gitUserName,
        gitUserEmail,
        gitAuthToken,
      });
    } catch (err) {
      logger.error("Git connect/validate failed:", err);
      return res.status(400).json({
        error:
          "Failed to connect to repository. Please verify the repo URL, branch, and access token.",
      });
    }

    // 2) Save configuration
    // map to Prisma model field names
    const gitConfigPayload = {
      provider: "github",
      repoUrl,
      branch,
      contentDir,
      authType: "ssh",
      authSecret: gitAuthToken,
      userName: gitUserName, // model field is userName
      userEmail: gitUserEmail, // model field is userEmail
    };

    await prisma.gitConfig.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, ...gitConfigPayload },
      update: gitConfigPayload,
    });

    return res.json({ configured: true, gitConfigPayload });
  } catch (err) {
    logger.error("Configure blog failed:", err);
    return res.status(500).json({ error: "Failed to configure blog" });
  }
}
