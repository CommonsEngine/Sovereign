import { getBlogProjectAccess, parseFrontmatter, normalizeTags } from "./get.js";

export default async function updatePost(req, res, _, ctx) {
  const { path, prisma, git, fm: FileManager, logger } = ctx;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Project id
    const projectId = req.params?.id;
    if (!projectId) return res.status(400).json({ error: "Missing project id" });

    // Filename (route param preferred), and content (markdown)
    const rawName =
      (typeof req.params?.fp === "string" && req.params.fp) ||
      (typeof req.body?.fp === "string" && req.body.fp) ||
      "";
    const filename = path.basename(String(rawName).trim());
    if (!filename || !/\.md$/i.test(filename)) {
      return res.status(400).json({ error: "Invalid filename. Expected a .md file." });
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
    if (typeof req.body?.title === "string") updates.title = req.body.title.trim().slice(0, 300);
    if (typeof req.body?.description === "string")
      updates.description = req.body.description.trim();
    if (typeof req.body?.coverUrl === "string") updates.coverUrl = req.body.coverUrl.trim();
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

    const access = await getBlogProjectAccess(
      req,
      res,
      projectId,
      {
        roles: ["owner", "editor"],
        responseType: "json",
      },
      ctx
    );
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).json({ error: "Project is not a blog type" });
    }

    // Load config
    const cfg = await prisma.gitConfig.findUnique({
      where: { projectId },
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
    let gm = git.getGitManager(projectId);
    if (!gm) {
      try {
        gm = await git.getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          branch: cfg.branch,
          userName: cfg.userName,
          userEmail: cfg.userEmail,
          authToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("✗ Git manager init failed during update:", err);
        return res.status(400).json({
          error: "Failed to access repository. Please verify the configuration.",
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
      logger.error("✗ Failed to read existing file:", err);
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
          Object.keys(updates).length > 0 ? updateFrontmatter(parts.fm, updates) : parts.fm;
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
      logger.error("✗ Update file failed:", err);
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
      const desiredPathRaw = typeof req.body?.path === "string" ? req.body.path.trim() : "";
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
            return res.status(409).json({ error: "A post with that slug already exists." });
          }

          await fs.rename(oldFsPath, newFsPath);

          logger.info(`Renamed post ${filename} -> ${desiredBase}`);

          resultingFilename = desiredBase;
          const redirectUrl = `/blog/${encodeURIComponent(
            projectId
          )}/blog/post/${encodeURIComponent(desiredBase)}?edit=true`;
          const relativeDir = (cfg.contentDir || "").trim();
          const finalPath = relativeDir ? `${relativeDir}/${desiredBase}` : desiredBase;

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
      logger.error("✗ Rename after update failed:", err);
      // Fall through to normal success if rename failed silently
    }

    const relativeDir = (cfg.contentDir || "").trim();
    const finalPath = relativeDir ? `${relativeDir}/${resultingFilename}` : resultingFilename;

    // Normal success (no rename)
    return res.status(200).json({
      updated: true,
      filename: resultingFilename,
      path: finalPath,
      meta: latestMeta,
    });
  } catch (err) {
    logger.error("✗ Update Blog post failed:", err);
    return res.status(500).json({ error: "Failed to update post" });
  }
}
