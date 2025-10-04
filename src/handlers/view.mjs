import prisma from "../prisma.mjs";
import {
  GUEST_LOGIN_ENABLED,
  GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
} from "../config.mjs";

export async function viewIndexPage(req, res) {
  try {
    let username = "";
    if (req.user) {
      try {
        const u = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { username: true },
        });
        if (u) username = u.username;
      } catch (error) {
        console.warn("Failed to load user username", error);
      }
    }

    // Fetch projects owned by the user OR where the user is admin/editor OR public (ownerId null)
    const userId = req.user?.id || null;
    const projects = await prisma.project.findMany({
      where: {
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
        name: true,
        des: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const showUserMenu = !(
      GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN
    );
    return res.render("index", {
      username,
      show_user_menu: showUserMenu,
      projects, // pass to view
    });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load projects",
      error: err?.message || String(err),
    });
  }
}

export async function viewLoginPage(req, res) {
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

export async function viewRegisterPage(_, res) {
  return res.render("register");
}

export async function viewProjectPage(req, res) {
  return res.render("project", { projectId: req.params.id });
}

export async function viewPostPage(req, res) {
  return res.render("post", {
    projectId: req.params.projectId,
    postId: req.params.postId,
  });
}

export async function viewUsersPage(req, res) {
  return res.render("users");
}

export async function viewSettingsPage(req, res) {
  return res.render("settings");
}
