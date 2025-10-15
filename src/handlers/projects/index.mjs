import {
  getGitManager,
  getOrInitGitManager,
  disposeGitManager,
} from "../../libs/git/registry.mjs";
import logger from "../../utils/logger.mjs";
import prisma from "../../prisma.mjs";

export { default as create } from "./core/create.mjs";
export { default as getAll } from "./core/getAll.mjs";
export { default as update } from "./core/update.mjs";
export { default as remove } from "./core/remove.mjs";

export * as blog from "./blog/index.mjs";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value) {
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return { iso: "", label: "" };
    return { iso: dt.toISOString(), label: DATE_FORMAT.format(dt) };
  } catch {
    return { iso: "", label: "" };
  }
}

const DEFAULT_SELECT = {
  id: true,
  name: true,
  desc: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  ownerId: true,
  Blog: {
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
};

// TODO: Maybe we can isolate these functions in a separate utils file if they are needed elsewhere
async function loadProject(projectId, select = DEFAULT_SELECT) {
  if (!projectId) return null;
  return prisma.project.findUnique({
    where: { id: projectId },
    select,
  });
}

function ensureAccess(project, req) {
  const userId = req.user?.id ?? null;
  // if ownerId set and doesn't match current user -> forbidden
  if (project.ownerId && project.ownerId !== userId) return false;
  return true;
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

export async function retryBlogConnection(req, res) {
  try {
    const projectId = req.params?.id || req.params?.projectId;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        type: true,
        Blog: {
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

    if (!project || project.type !== "blog") {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!ensureAccess({ ownerId: project.ownerId }, req)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const cfg = project.Blog?.gitConfig;
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

export async function viewProject(req, res) {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad Request",
        description: "Missing project id",
      });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not Found",
        description: "Project not found",
      });
    }

    if (!ensureAccess(project, req)) {
      return res.status(403).render("error", {
        code: 403,
        message: "Forbidden",
        description: "You do not have access to this project",
      });
    }

    if (project.type === "blog") {
      // If this is a blog and not configured yet, send to configure flow
      const needsBlogConfigure = !project.Blog?.gitConfig;
      if (needsBlogConfigure) {
        return res.redirect(302, `/p/${project.id}/configure`);
      }

      // Try to use cached connection; if missing or broken, try to (re)connect once.
      let connected = false;
      try {
        const cached = getGitManager(project.id);
        if (cached) {
          await cached.pullLatest(); // quick connectivity check
          connected = true;
        } else {
          const cfg = await prisma.gitConfig.findUnique({
            where: { blogId: project.Blog.id },
            select: {
              repoUrl: true,
              branch: true,
              userName: true,
              userEmail: true,
              authSecret: true,
            },
          });
          if (cfg) {
            await getOrInitGitManager(project.id, {
              repoUrl: cfg.repoUrl,
              branch: cfg.branch,
              userName: cfg.userName,
              userEmail: cfg.userEmail,
              authToken: cfg.authSecret || null,
            });
            connected = true;
          }
        }
      } catch {
        connected = false;
      }

      // If still not connected, reset config to avoid loop and redirect to configure
      if (!connected) {
        try {
          disposeGitManager(project.id);
          await prisma.gitConfig.delete({
            where: { blogId: project.Blog.id },
          });
        } catch {
          // ignore if already deleted
        }
        // return res.redirect(302, `/p/${project.id}/configure`);
      }

      const gitConfig = project.Blog?.gitConfig || null;
      const created = formatDate(project.createdAt);
      const updated = formatDate(project.updatedAt);
      const projectView = {
        id: project.id,
        name: project.name,
        desc: project.desc || "",
        status: project.status || "draft",
        repoUrl: gitConfig?.repoUrl || "",
        branch: gitConfig?.branch || "main",
        contentDir: gitConfig?.contentDir || "",
        gitUserName: gitConfig?.userName || "",
        gitUserEmail: gitConfig?.userEmail || "",
        createdAtISO: created.iso,
        createdAtDisplay: created.label,
        updatedAtISO: updated.iso,
        updatedAtDisplay: updated.label,
      };

      return res.render("project/blog/index", {
        project: projectView,
        connected,
        connect_error: !connected,
      });
    }

    return res.status(404).render("error", {
      code: 404,
      message: "Not Found",
      description: "Project not found",
    });
  } catch (err) {
    logger.error("Render project page failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load project",
      error: err?.message || String(err),
    });
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

    const project = await loadProject(projectId, {
      id: true,
      name: true,
      type: true,
      Blog: {
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
    });

    if (!project) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not found",
        description: "Project not found",
      });
    }

    if (!ensureAccess(project, req)) {
      return res.status(403).render("error", {
        code: 403,
        message: "Forbidden",
        description: "You do not have access to this project",
      });
    }

    // Only blogs have configuration flow. If already configured or not a blog, redirect to project.
    const alreadyConfigured = !!project.Blog?.gitConfig;
    if (project.type !== "blog" || alreadyConfigured) {
      return res.redirect(302, `/p/${project.id}`);
    }

    return res.render("project/blog/configure", {
      project,
      gitConfig: project.Blog?.gitConfig || null,
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
