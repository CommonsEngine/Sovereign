import env from "$/config/env.mjs";

const { GUEST_LOGIN_ENABLED, GUEST_LOGIN_ENABLED_BYPASS_LOGIN } = env();

export async function viewIndex(_, res) {
  try {
    const showUserMenu = !(GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN);

    return res.render("index", {
      show_user_menu: showUserMenu,
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
