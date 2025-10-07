import { isFeatureEnabled } from "../config/flags.mjs";

export function requireFeature(key) {
  return (_, res, next) =>
    isFeatureEnabled(key) ? next() : res.status(404).end();
}
