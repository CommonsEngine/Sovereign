import { ensureProjectAccess } from "../_utils.js";

export default async function configureProject(req, res, _, ctx) {
  const { logger, prisma, git } = ctx;
  try {
    const projectId = req.params.id;
    logger.info("Configuring blog for project: >>", projectId);
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

    await ensureProjectAccess(
      {
        projectId,
        user: req.user,
        allowedRoles: ["owner"],
      },
      ctx
    );

    const raw = req.body || {};

    const repoUrl = String(raw.repoUrl || "").trim();
    if (!repoUrl) return res.status(400).json({ error: "Repository URL is required" });

    const branch = (String(raw.branch || raw.defaultBranch || "main").trim() || "main").slice(
      0,
      80
    );
    const contentDirRaw = typeof raw.contentDir === "string" ? raw.contentDir : "";
    const contentDir = contentDirRaw.trim().slice(0, 200) || null;
    const gitUserName =
      typeof raw.gitUserName === "string" ? raw.gitUserName.trim().slice(0, 120) : null;
    const gitUserEmail =
      typeof raw.gitUserEmail === "string" ? raw.gitUserEmail.trim().slice(0, 120) : null;
    const gitAuthToken = typeof raw.gitAuthToken === "string" ? raw.gitAuthToken.trim() : null;

    // 1) Validate by connecting once and prime the in-memory connection
    try {
      await git.getOrInitGitManager(projectId, {
        repoUrl,
        branch,
        gitUserName,
        gitUserEmail,
        gitAuthToken,
      });
    } catch (err) {
      logger.error("✗ Git connect/validate failed:", err);
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

    const gitConfig = await prisma.gitConfig.upsert({
      where: { projectId },
      create: { projectId, ...gitConfigPayload },
      update: gitConfigPayload,
    });

    await prisma.blog.update({
      where: { id: blog.id },
      data: {
        gitConfig: {
          connect: { id: gitConfig.id },
        },
      },
    });

    return res.json({ configured: true, gitConfigPayload });
  } catch (err) {
    logger.error("✗ Configure blog failed:", err);
    return res.status(500).json({ error: "Failed to configure blog" });
  }
}
