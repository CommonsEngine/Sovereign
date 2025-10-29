import { getBlogProjectAccess } from "./posts/get.js";

export default async function retryConnection(req, res, _, ctx) {
  const { git, logger } = ctx;
  try {
    const projectId = req.params?.id || req.params?.projectId;
    if (!projectId) return res.status(400).json({ error: "Missing project id" });

    const access = await getBlogProjectAccess(
      req,
      res,
      projectId,
      {
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
      },
      ctx
    );
    if (!access) return;
    const project = access.project;

    if (!project || project.type !== "blog") {
      return res.status(404).json({ error: "Project not found" });
    }

    const cfg = project.blog?.gitConfig;
    if (!cfg) {
      return res.status(400).json({ error: "Blog configuration is missing." });
    }

    git.disposeGitManager(projectId);
    await git.getOrInitGitManager(projectId, {
      repoUrl: cfg.repoUrl,
      branch: cfg.branch,
      userName: cfg.userName,
      userEmail: cfg.userEmail,
      authToken: cfg.authSecret || null,
    });

    return res.json({ connected: true });
  } catch (err) {
    logger.error("✗ Retry blog connection failed:", err);
    return res.status(500).json({ error: "Failed to reconnect" });
  }
}
