import { isEnabled } from "../config/flags.mjs";

export function requireFeature(key) {
  return (_, res, next) => (isEnabled(key) ? next() : res.status(403).end());
}
