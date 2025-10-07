import path from "path";

import {
  getGitManager,
  getOrInitGitManager,
} from "../../libs/gitcms/registry.mjs";
import FileManager from "../../libs/gitcms/fs.mjs";
import logger from "../../utils/logger.mjs";
import prisma from "../../prisma.mjs";

async function configure(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const projectId = req.params?.projectId || req.body?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    // Owner + type check
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, type: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (project.type !== "gitcms") {
      return res.status(400).json({ error: "Project is not a GitCMS type" });
    }

    const raw = req.body || {};
    const repoUrl = String(raw.repoUrl || "").trim();
    const defaultBranch = (
      String(raw.defaultBranch || "main").trim() || "main"
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

    if (!repoUrl)
      return res.status(400).json({ error: "Repository URL is required" });

    // 1) Validate by connecting once and prime the in-memory connection
    try {
      await getOrInitGitManager(projectId, {
        repoUrl,
        defaultBranch,
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

    // 2) Persist config only after successful validation
    const config = await prisma.projectGitCMS.upsert({
      where: { projectId },
      update: {
        repoUrl,
        defaultBranch,
        contentDir,
        gitUserName,
        gitUserEmail,
        ...(gitAuthToken
          ? { authSecret: gitAuthToken, authType: "token" }
          : {}),
      },
      create: {
        projectId: id,
        repoUrl,
        defaultBranch,
        contentDir,
        gitUserName,
        gitUserEmail,
        ...(gitAuthToken
          ? { authSecret: gitAuthToken, authType: "token" }
          : {}),
      },
      select: {
        projectId: true,
        repoUrl: true,
        defaultBranch: true,
        contentDir: true,
        gitUserName: true,
        gitUserEmail: true,
      },
    });

    return res.status(200).json({ configured: true, gitcms: config });
  } catch (err) {
    logger.error("Configure GitCMS failed:", err);
    return res.status(500).json({ error: "Failed to save configuration" });
  }
}

async function getPosts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // 1) Fetch project id from URL params
    const projectId = req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, type: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (project.type !== "gitcms") {
      return res.status(400).json({ error: "Project is not a GitCMS type" });
    }

    // 2) Fetch gitcms config by project id
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
      return res.status(400).json({ error: "GitCMS not configured" });
    }

    // 3) Fetch posts using GitManager from repo working directory
    let gm = getGitManager(projectId);
    if (!gm) {
      gm = await getOrInitGitManager(projectId, {
        repoUrl: cfg.repoUrl,
        defaultBranch: cfg.defaultBranch,
        gitUserName: cfg.gitUserName,
        gitUserEmail: cfg.gitUserEmail,
        gitAuthToken: cfg.authSecret || null,
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
    const posts = await fm.listMarkdownFiles();

    return res.status(200).json({ posts });
  } catch (e) {
    logger.error("List GitCMS posts failed:", e);
    return res.status(500).json({ error: "Failed to list posts" });
  }
}

async function deletePost(req, res) {
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
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, type: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (project.type !== "gitcms") {
      return res.status(400).json({ error: "Project is not a GitCMS type" });
    }

    // Load config
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
      return res.status(400).json({ error: "GitCMS not configured" });
    }

    // Ensure Git connection
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
    try {
      await gm.publish(`Delete post: ${filename}`);
    } catch (err) {
      pushed = false;
      logger.warn("Publish failed after deletion:", err?.message || err);
    }

    return res.status(200).json({ deleted: true, filename, pushed });
  } catch (err) {
    logger.error("Delete GitCMS post failed:", err);
    return res.status(500).json({ error: "Failed to delete post" });
  }
}

async function updatePost(req, res) {
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

    // Verify ownership and type
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, type: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (project.type !== "gitcms") {
      return res.status(400).json({ error: "Project is not a GitCMS type" });
    }

    // Load config
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
      return res.status(400).json({ error: "GitCMS not configured" });
    }

    // Ensure Git working directory exists (no commit/push here)
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

          // Respond with redirect info for the client to navigate
          const redirectUrl = `/p/${encodeURIComponent(
            projectId,
          )}/gitcms/post/${encodeURIComponent(desiredBase)}?edit=true`;
          return res.status(200).json({
            updated: true,
            renamed: true,
            filename: desiredBase,
            redirect: redirectUrl,
          });
        }
      }
    } catch (err) {
      logger.error("Rename after update failed:", err);
      // Fall through to normal success if rename failed silently
    }

    // Normal success (no rename)
    return res.status(200).json({ updated: true, filename });
  } catch (err) {
    logger.error("Update GitCMS post failed:", err);
    return res.status(500).json({ error: "Failed to update post" });
  }
}

async function publishPost(req, res) {
  // We need to simply commit and push any changes that are currently in the working directory
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const projectId = req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, type: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (project.type !== "gitcms") {
      return res.status(400).json({ error: "Project is not a GitCMS type" });
    }

    // Load config to init manager if needed
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
      return res.status(400).json({ error: "GitCMS not configured" });
    }

    // Ensure Git manager
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
    logger.error("Publish GitCMS changes failed:", err);
    // Common non-fast-forward hint
    const msg = String(err?.message || err);
    const hint = /non-fast-forward|fetch first|rejected/i.test(msg)
      ? "Remote has new commits. Pull/rebase then try again."
      : undefined;
    return res
      .status(500)
      .json({ error: "Failed to publish changes", hint, detail: msg });
  }
}

const gitcms = {
  configure,
  getPosts,
  updatePost,
  publishPost,
  deletePost,
};

export default gitcms;
