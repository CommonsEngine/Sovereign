import { getBlogProjectAccess } from "./get.js";

export default async function deletePost(req, res, _, ctx) {
  const { path, prisma, git, logger, fm: FileManager } = ctx;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Project id
    const projectId = req.params?.id;
    if (!projectId) return res.status(400).json({ error: "Missing project id" });

    // File name (from route param, body, or query)
    const rawName =
      (typeof req.params?.fp === "string" && req.params.fp) ||
      (typeof req.body?.fp === "string" && req.body.fp) ||
      (typeof req.query?.fp === "string" && req.query.fp) ||
      "";
    const filename = path.basename(String(rawName).trim());
    if (!filename || !/\.md$/i.test(filename)) {
      return res.status(400).json({ error: "Invalid filename. Expected a .md file." });
    }

    // Verify ownership and type
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
      return res.status(400).json({ error: "Unsupported project type" });
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

    // Ensure Git connection
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
        logger.error("✗ Git connect failed during delete:", err);
        return res.status(400).json({
          error: "Failed to connect to repository. Please verify the configuration.",
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
      logger.error("✗ Delete file failed:", err);
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
        responsePayload.hint = "Remote has new commits. Pull/rebase locally then retry publish.";
      }
      responsePayload.error = "Repository push failed";
      responsePayload.detail = msg;
      return res.status(202).json(responsePayload);
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    logger.error("✗ Delete Blog post failed:", err);
    return res.status(500).json({ error: "Failed to delete post" });
  }
}
