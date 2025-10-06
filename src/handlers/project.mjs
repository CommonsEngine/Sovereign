import path from "path";

import prisma from "../prisma.mjs";
import { uuid } from "../utils/id.mjs";
import {
  getGitManager,
  getOrInitGitManager,
} from "../libs/gitcms/registry.mjs";
import FileManager from "../libs/gitcms/fs.mjs";
import { flags } from "../config/flags.mjs";

export async function createProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Build allowed types from flags
    const allowedTypes = new Set(
      [
        flags.gitcms && "gitcms",
        flags.papertrail && "papertrail",
        flags.workspace && "workspace",
      ].filter(Boolean),
    );
    const allowedScopes = new Set(["private", "org", "public"]);

    const raw = req.body || {};
    const name =
      String(raw.name ?? "")
        .trim()
        .slice(0, 120) || "Untitled";

    // If requested type is disabled, fall back to first enabled, else 400
    const requestedType = String(raw.type || "").trim();
    let type = allowedTypes.has(requestedType)
      ? requestedType
      : [...allowedTypes][0];

    if (!type) {
      return res.status(400).json({ error: "No project types are enabled." });
    }

    const scope = allowedScopes.has(String(raw.scope))
      ? String(raw.scope)
      : "private";
    const desc =
      raw.desc != null ? String(raw.desc).trim().slice(0, 500) : null;

    const project = await prisma.project.create({
      data: {
        id: uuid("p_"),
        name,
        desc,
        type,
        scope,
        ownerId: userId,
        ...(type === "papertrail" ? { papertrail: { create: {} } } : {}),
      },
      select: { id: true },
    });

    const url =
      type === "gitcms" ? `/p/${project.id}/configure` : `/p/${project.id}`;
    return res.status(201).json({
      ...project,
      url,
      ...(type === "papertrail"
        ? { papertrail: { nodes: [], edges: [] } }
        : {}),
    });
  } catch (e) {
    console.error("Create project failed:", e);
    return res.status(500).json({ error: "Failed to create project" });
  }
}

export async function deleteProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Only the owner can delete
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Cascades will remove subtype records (gitcms/papertrail/workspace) and related rows as defined in schema
    await prisma.project.delete({ where: { id } });

    return res.status(204).end();
  } catch (e) {
    console.error("Delete project failed:", e);
    return res.status(500).json({ error: "Failed to delete project" });
  }
}

export async function updateProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const raw = req.body || {};
    const name =
      typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : undefined;

    if (!name || name.length === 0) {
      return res.status(400).json({ error: "Invalid name" });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });

    return res.status(200).json(updated);
  } catch (e) {
    console.error("Update project failed:", e);
    return res.status(500).json({ error: "Failed to update project" });
  }
}

export async function configureGitCMS(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    // Owner + type check
    const project = await prisma.project.findUnique({
      where: { id },
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
      await getOrInitGitManager(id, {
        repoUrl,
        defaultBranch,
        gitUserName,
        gitUserEmail,
        gitAuthToken,
      });
    } catch (err) {
      console.error("Git connect/validate failed:", err);
      return res.status(400).json({
        error:
          "Failed to connect to repository. Please verify the repo URL, branch, and access token.",
      });
    }

    // 2) Persist config only after successful validation
    const config = await prisma.projectGitCMS.upsert({
      where: { projectId: id },
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
  } catch (e) {
    console.error("Configure GitCMS failed:", e);
    return res.status(500).json({ error: "Failed to save configuration" });
  }
}

export async function listGitCMSPosts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // 1) Fetch project id from URL params
    const id = req.params?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const project = await prisma.project.findUnique({
      where: { id },
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
      where: { projectId: id },
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
    let gm = getGitManager(id);
    if (!gm) {
      gm = await getOrInitGitManager(id, {
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
      console.warn(
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
    console.error("List GitCMS posts failed:", e);
    return res.status(500).json({ error: "Failed to list posts" });
  }
}

export async function deleteGitCMSPost(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Project id
    const id = req.params?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    // File name (from route param, body, or query)
    const rawName =
      (typeof req.params?.filename === "string" && req.params.filename) ||
      (typeof req.body?.filename === "string" && req.body.filename) ||
      (typeof req.query?.filename === "string" && req.query.filename) ||
      "";
    const filename = path.basename(String(rawName).trim());
    if (!filename || !/\.md$/i.test(filename)) {
      return res
        .status(400)
        .json({ error: "Invalid filename. Expected a .md file." });
    }

    // Verify ownership and type
    const project = await prisma.project.findUnique({
      where: { id },
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
      where: { projectId: id },
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
    let gm = getGitManager(id);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(id, {
          repoUrl: cfg.repoUrl,
          defaultBranch: cfg.defaultBranch,
          gitUserName: cfg.gitUserName,
          gitUserEmail: cfg.gitUserEmail,
          gitAuthToken: cfg.authSecret || null,
        });
      } catch (err) {
        console.error("Git connect failed during delete:", err);
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
      console.warn("Pull latest failed before deletion:", err?.message || err);
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
      console.error("Delete file failed:", err);
      return res.status(500).json({ error: "Failed to delete file" });
    }

    // Commit and push
    let pushed = true;
    try {
      await gm.publish(`Delete post: ${filename}`);
    } catch (err) {
      pushed = false;
      console.warn("Publish failed after deletion:", err?.message || err);
    }

    return res.status(200).json({ deleted: true, filename, pushed });
  } catch (e) {
    console.error("Delete GitCMS post failed:", e);
    return res.status(500).json({ error: "Failed to delete post" });
  }
}

export async function updateGitCMSPost(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Project id
    const id = req.params?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    // Filename (route param preferred), and content (markdown)
    const rawName =
      (typeof req.params?.filename === "string" && req.params.filename) ||
      (typeof req.body?.filename === "string" && req.body.filename) ||
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
      where: { id },
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
      where: { projectId: id },
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
    let gm = getGitManager(id);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(id, {
          repoUrl: cfg.repoUrl,
          defaultBranch: cfg.defaultBranch,
          gitUserName: cfg.gitUserName,
          gitUserEmail: cfg.gitUserEmail,
          gitAuthToken: cfg.authSecret || null,
        });
      } catch (err) {
        console.error("Git manager init failed during update:", err);
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
      console.error("Failed to read existing file:", err);
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
      console.error("Update file failed:", err);
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

          console.log(`Renamed post ${filename} -> ${desiredBase}`);

          // Respond with redirect info for the client to navigate
          const redirectUrl = `/p/${encodeURIComponent(
            id,
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
      console.error("Rename after update failed:", err);
      // Fall through to normal success if rename failed silently
    }

    // Normal success (no rename)
    return res.status(200).json({ updated: true, filename });
  } catch (e) {
    console.error("Update GitCMS post failed:", e);
    return res.status(500).json({ error: "Failed to update post" });
  }
}

export async function publishGitCMSPost(req, res) {
  // We need to simply commit and push any changes that are currently in the working directory
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const project = await prisma.project.findUnique({
      where: { id },
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
      where: { projectId: id },
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
    let gm = getGitManager(id);
    if (!gm) {
      try {
        gm = await getOrInitGitManager(id, {
          repoUrl: cfg.repoUrl,
          defaultBranch: cfg.defaultBranch,
          gitUserName: cfg.gitUserName,
          gitUserEmail: cfg.gitUserEmail,
          gitAuthToken: cfg.authSecret || null,
        });
      } catch (err) {
        console.error("Git connect failed during publish:", err);
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
      console.warn("Pull latest failed before publish:", err?.message || err);
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
  } catch (e) {
    console.error("Publish GitCMS changes failed:", e);
    // Common non-fast-forward hint
    const msg = String(e?.message || e);
    const hint = /non-fast-forward|fetch first|rejected/i.test(msg)
      ? "Remote has new commits. Pull/rebase then try again."
      : undefined;
    return res
      .status(500)
      .json({ error: "Failed to publish changes", hint, detail: msg });
  }
}
