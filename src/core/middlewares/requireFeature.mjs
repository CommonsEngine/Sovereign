import { isFeatureEnabled } from "$/core/config/flags.mjs";

// Usage: requireFeature("blog"); requireFeature(["blog", "workspace"]); requireFeature(["blog", "workspace"], { mode: "any" });
export default function requireFeature(keys, { mode = "all" } = {}) {
  const features = (Array.isArray(keys) ? keys : [keys]).filter(
    (feature) => typeof feature === "string" && feature.length > 0,
  );
  const requireAny = mode === "any";

  return (_, res, next) => {
    if (features.length === 0) {
      return res.status(404).end();
    }

    const enabled = requireAny
      ? features.some((feature) => isFeatureEnabled(feature))
      : features.every((feature) => isFeatureEnabled(feature));

    return enabled ? next() : res.status(404).end();
  };
}
