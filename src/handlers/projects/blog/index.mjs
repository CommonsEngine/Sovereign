import logger from "../../../utils/logger.mjs";
import prisma from "../../../prisma.mjs";
import { getOrInitGitManager } from "../../../libs/gitcms/registry.mjs";

function ensureAccess(project, req) {
  const userId = req.user?.id ?? null;
  // if ownerId set and doesn't match current user -> forbidden
  if (project.ownerId && project.ownerId !== userId) return false;
  return true;
}

export async function configure(req, res) {
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
        project: { select: { id: true, ownerId: true } },
      },
    });

    if (!blog) {
      return res.status(404).json({ error: "Unsupported project type" });
    }
    if (blog?.gitConfig) {
      return res.status(400).json({ error: "Blog already configured" });
    }

    if (!ensureAccess(blog.project, req)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const raw = req.body || {};

    const repoUrl = String(raw.repoUrl || "").trim();
    if (!repoUrl)
      return res.status(400).json({ error: "Repository URL is required" });

    const branch = (String(raw.branch || "main").trim() || "main").slice(0, 80);
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
