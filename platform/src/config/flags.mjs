import { toBool } from "$/utils/misc.mjs";

// TODO: Should allow registering new project types and flags.
// TODO: Fetch feature toggles from DB-stored config (e.g. per-tenant or per-user overrides).

export const flags = {
  blog: toBool(process.env.FT_PROJECT_TYPE_BLOG, true),
  papertrail: toBool(process.env.FT_PROJECT_TYPE_PAPERTRAIL, false),
  workspace: toBool(process.env.FT_PROJECT_TYPE_WORKSPACE, false),
};

export const isFeatureEnabled = (k) => !!flags[k];
