import env from "../../config/env.mjs";
import { isFeatureEnabled } from "../../config/flags.mjs";
import { useHeadConfig } from "../../config/head.mjs";
import {
  getGitManager,
  getOrInitGitManager,
  disposeGitManager,
} from "../../libs/gitcms/registry.mjs";
import logger from "../../utils/logger.mjs";
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

export async function register(req, res) {
  // if URL param ?token=? is present, show invite registration mode
  // First validate the token, and if valid populate email and display name fields
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!token) {
    return res.status(403).render("register", {
      // error: "Registration is by invitation only.",
      values: { display_name: "", username: "", email: "" },
    });
  }

  try {
    const invite = await prisma.verificationToken.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true, purpose: true },
    });

    const valid =
      !!invite &&
      invite.purpose === "invite" &&
      invite.expiresAt instanceof Date &&
      invite.expiresAt > new Date();

    if (!valid) {
      return res.status(400).render("register", {
        error: "Invalid or expired invite link.",
        values: { display_name: "", username: "", email: "" },
      });
    }

    const invitedUser = await prisma.user.findUnique({
      where: { id: invite.userId },
      select: { email: true, username: true, displayName: true },
    });

    if (!invitedUser) {
      return res.status(400).render("register", {
        error: "Invalid invite.",
        values: { display_name: "", username: "", email: "" },
      });
    }

    // Prefill email (readonly in template) and display name if present
    return res.render("register", {
      invite_mode: true,
      token,
      success: "Invitation accepted. Please complete your registration.",
      values: {
        display_name: invitedUser.displayName || "",
        username: invitedUser.username || "",
        email: invitedUser.email,
      },
    });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load registration form",
      error: err?.message || String(err),
    });
  }
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
    return res.render("project/gitcms/configure", {
      project,
      username: req.user?.username || "",
    });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load configuration",
      error: err?.message || String(err),
    });
  }
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    const fmt = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return { iso: dt.toISOString(), text: fmt.format(dt) };
  } catch {
    return { iso: "", text: "" };
  }
}

function roleLabel(role) {
  switch (role) {
    case 0:
      return "owner";
    case 1:
      return "admin";
    case 2:
      return "editor";
    case 3:
      return "contributor";
    case 4:
      return "viewer";
    case 9:
      return "guest";
    default:
      return "unknown";
  }
}

export async function users(req, res) {
  try {
    const rawUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // N+1 project assignment count per user (owner/admin/editor)
    const users = await Promise.all(
      rawUsers.map(async (u) => {
        const projects = await prisma.project.findMany({
          where: {
            OR: [
              { ownerId: u.id },
              { admins: { some: { id: u.id } } },
              { editors: { some: { id: u.id } } },
            ],
          },
          select: { id: true },
        });
        const assigned = new Set(projects.map((p) => p.id)).size;
        const name = u.displayName || u.username || u.email;
        const { iso, text } = fmtDate(u.createdAt);
        return {
          id: u.id,
          email: u.email,
          username: u.username,
          displayName: name,
          roleLabel: roleLabel(u.role),
          status: u.status,
          projectsAssigned: assigned,
          createdAtISO: iso,
          createdAtDisplay: text,
        };
      }),
    );

    return res.render("users", { username: req.user?.username || "", users });
  } catch (err) {
    logger.error("users view failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load users",
      error: err?.message || String(err),
    });
  }
}

export async function settings(req, res) {
  return res.render("settings", { username: req.user?.username || "" });
}
