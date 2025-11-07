import { getBlogProjectAccess } from "./get.js";

export default async function publishPost(req, res, _, ctx) {
  const { prisma, git, logger } = ctx;
  ctx?.assertUserCapability?.(req, "user:plugin.blog.post.publish");
  // We need to simply commit and push any changes that are currently in the working directory
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const projectId = req.params?.id;
    if (!projectId) return res.status(400).json({ error: "Missing project id" });

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
      return res.status(400).json({ error: "Project is not a blog type" });
    }

    // Load config to init manager if needed
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

    // Ensure Git manager
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
        logger.error("✗ Git connect failed during publish:", err);
        return res.status(400).json({
          error: "Failed to connect to repository. Please verify the configuration.",
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

    const rawMsg = typeof req.body?.message === "string" ? req.body.message : null;
    const commitMessage = (rawMsg || "Update with Sovereign").toString().trim().slice(0, 200);

    const result = await gm.publish(commitMessage);

    // Normalize response
    if (result && result.message && /No changes/i.test(result.message)) {
      return res.status(200).json({ published: false, message: result.message });
    }

    return res.status(200).json({
      published: true,
      message: result?.message || "Changes published successfully",
    });
  } catch (err) {
    logger.error("✗ Publish Blog changes failed:", err);
    // Common non-fast-forward hint
    const msg = String(err?.message || err);
    const nonFastForward = /non-fast-forward|fetch first|rejected/i.test(msg);
    const hint = nonFastForward ? "Remote has new commits. Pull/rebase then try again." : undefined;
    return res.status(nonFastForward ? 409 : 500).json({
      error: "Failed to publish changes",
      hint,
      detail: msg,
    });
  }
}
