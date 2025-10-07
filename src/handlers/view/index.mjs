import env from "../../config/env.mjs";
import { isFeatureEnabled } from "../../config/flags.mjs";
import { useHeadConfig } from "../../config/head.mjs";
import {
  getGitManager,
  getOrInitGitManager,
  disposeGitManager,
} from "../../libs/gitcms/registry.mjs";
import prisma from "../../prisma.mjs";

export { default as gitcms } from "./gitcms.mjs";

const { GUEST_LOGIN_ENABLED, GUEST_LOGIN_ENABLED_BYPASS_LOGIN } = env();

export async function index(req, res) {
  try {
    const userId = req.user?.id || null;

    // Build allowed types from feature flags
    const allowedTypes = ["gitcms", "papertrail", "workspace"].filter((t) =>
      isFeatureEnabled(t),
    );

    // If no types are enabled, short-circuit to empty list
    const projectsRaw =
      allowedTypes.length === 0
        ? []
        : await prisma.project.findMany({
            where: {
              AND: [{ type: { in: allowedTypes } }],
              OR: [
                { ownerId: null },
                ...(userId
                  ? [
                      { ownerId: userId },
                      { admins: { some: { id: userId } } },
                      { editors: { some: { id: userId } } },
                    ]
                  : []),
              ],
            },
            select: {
              id: true,
              type: true,
              scope: true,
              name: true,
              desc: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              ownerId: true, // needed to compute ownership
            },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          });

    // Compute owned and omit ownerId from the response
    const projects = projectsRaw.map(({ ownerId, ...rest }) => ({
      ...rest,
      owned: !!(userId && ownerId === userId),
    }));

    const showUserMenu = !(
      GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN
    );

    return res.render(
      "index",
      useHeadConfig(
        {
          username: req.user?.username,
          show_user_menu: showUserMenu,
          projects,
        },
        req,
      ),
    );
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load projects",
      error: err?.message || String(err),
    });
  }
}

export async function login(req, res) {
  if (GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN) {
    return res.redirect(302, "/");
  }
  const justRegistered = String(req.query.registered || "") === "1";
  const justReset = String(req.query.reset || "") === "1";
  const returnTo =
    typeof req.query.return_to === "string" ? req.query.return_to : "";
  const forgotMode = String(req.query.forgot || "") === "1";
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const resetMode = !!token;
  return res.render("login", {
    success: justRegistered
      ? "Account created. Please sign in."
      : justReset
        ? "Password updated. Please sign in."
        : null,
    return_to: returnTo,
    forgot_mode: forgotMode && !resetMode,
    reset_mode: resetMode,
    token,
    guest_enabled: GUEST_LOGIN_ENABLED && !GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
  });
}

export async function register(_, res) {
  return res.render("register");
}

export async function project(req, res) {
  const projectId = req.params.projectId;
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        desc: true,
        type: true,
        scope: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        gitcms: {
          select: {
            projectId: true,
            repoUrl: true,
            defaultBranch: true,
            contentDir: true,
            provider: true,
            authType: true,
            gitUserName: true,
            gitUserEmail: true,
          },
        },
        papertrail: {
          select: {
            projectId: true,
          },
        },
        workspace: {
          select: {
            projectId: true,
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

    if (isFeatureEnabled(project.type) === false) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not found",
        description: "Project not found",
      });
    }

    // GitCMS: ensure connection is active; if not configured -> configure.
    if (project.type === "gitcms") {
      if (!project.gitcms) {
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
          const cfg = await prisma.projectGitCMS.findUnique({
            where: { projectId: project.id },
            select: {
              repoUrl: true,
              defaultBranch: true,
              gitUserName: true,
              gitUserEmail: true,
              authSecret: true,
            },
          });
          if (cfg) {
            await getOrInitGitManager(project.id, {
              repoUrl: cfg.repoUrl,
              defaultBranch: cfg.defaultBranch,
              gitUserName: cfg.gitUserName,
              gitUserEmail: cfg.gitUserEmail,
              gitAuthToken: cfg.authSecret || null,
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
          await prisma.projectGitCMS.delete({
            where: { projectId: project.id },
          });
        } catch {
          // ignore if already deleted
        }
        return res.redirect(302, `/p/${project.id}/configure`);
      }
    }

    let view = "project";
    const ctx = { project };

    switch (project.type) {
      case "gitcms":
        view = "project/gitcms";
        ctx.gitcms = project.gitcms || null;
        break;
      case "papertrail":
        view = "project/papertrail";
        ctx.papertrail = project.papertrail || null;
        ctx.app_version = "0.1.0"; // TODO: dynamic
        ctx.schema_version = 1;
        ctx.board_id = projectId;
        ctx.board_title = project.name;
        ctx.board_visibility = project.scope;
        ctx.board_status = project.status;
        ctx.is_owner = true;
        break;
      case "workspace":
        view = "project/workspace";
        ctx.workspace = project.workspace || null;
        break;
      default:
        // fall back to generic project view
        break;
    }

    return res.render(view, ctx);
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load project",
      error: err?.message || String(err),
    });
  }
}

export async function projectConfigure(req, res) {
  try {
    const projectId = req.params.projectId;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        type: true,
        gitcms: { select: { projectId: true } },
      },
    });

    if (!project) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not found",
        description: "Project not found",
      });
    }

    // Only GitCMS has a configuration flow; others go to project page
    const alreadyConfigured =
      project.type === "gitcms" ? !!project.gitcms : true;

    if (project.type !== "gitcms" || alreadyConfigured) {
      return res.redirect(302, `/p/${project.id}`);
    }

    // Render GitCMS configuration page
    return res.render("project/gitcms/configure", { project });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load configuration",
      error: err?.message || String(err),
    });
  }
}

export async function users(req, res) {
  return res.render("users", { username: req.user?.username || "" });
}

export async function settings(req, res) {
  return res.render("settings", { username: req.user?.username || "" });
}
