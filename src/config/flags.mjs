import { toBool } from "./utils.mjs";

export const flags = {
  gitcms: toBool(process.env.FT_PROJECT_TYPE_GITCMS, true),
  papertrail: toBool(process.env.FT_PROJECT_TYPE_PAPERTRAIL, false),
  workspace: toBool(process.env.FT_PROJECT_TYPE_WORKSPACE, false),
};

export const isEnabled = (k) => !!flags[k];
