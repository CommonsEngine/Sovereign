import requireRole from "$/middlewares/requireRole.js";

const CAPABILITY_PRECEDENCE = {
  allow: 5,
  consent: 4,
  compliance: 3,
  scoped: 2,
  anonymized: 2,
  deny: 1,
};

export class PluginCapabilityError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = options.name || "PluginCapabilityError";
    this.status = options.status || 500;
    this.code = options.code || "ERR_PLUGIN_CAPABILITY";
    this.meta = options.meta || {};
  }
}

export function createPluginAuthHelpers({ logger } = {}) {
  const assertUserCapability = (req, capabilityKey, options = {}) => {
    if (!req?.user) {
      throw new PluginCapabilityError("Missing authenticated user", {
        status: 401,
        code: "ERR_AUTH_REQUIRED",
      });
    }

    const min = options.minValue || "allow";
    const capabilities = req.user.capabilities || {};
    const value = capabilities[capabilityKey];
    const meetsThreshold =
      value && (CAPABILITY_PRECEDENCE[value] || 0) >= (CAPABILITY_PRECEDENCE[min] || 0);

    if (!meetsThreshold) {
      if (logger) {
        logger.warn?.(
          `[plugins] capability assertion failed`,
          Object.assign(
            {
              capability: capabilityKey,
              actual: value || "none",
              required: min,
              userId: req.user.id,
            },
            options.meta || {}
          )
        );
      }
      throw new PluginCapabilityError("Forbidden", {
        status: 403,
        code: "ERR_CAPABILITY_REQUIRED",
        meta: { capability: capabilityKey, required: min },
      });
    }

    return true;
  };

  const requireAuthz = ({ roles = [], capabilities = [] } = {}) => {
    const guard = requireRole([...roles, ...capabilities.map((cap) => `cap:${cap}`)]);
    return guard;
  };

  return {
    assertUserCapability,
    requireAuthz,
  };
}

export function createPlatformCapabilityAsserter(namespace, granted = []) {
  const grantedSet = new Set(granted);
  return function assertPlatformCapability(capabilityKey) {
    if (grantedSet.has(capabilityKey)) return true;
    throw new PluginCapabilityError(
      `Plugin ${namespace} attempted to use platform capability "${capabilityKey}" without declaring it`,
      {
        code: "ERR_PLATFORM_CAPABILITY_REQUIRED",
        status: 500,
        meta: { namespace, capability: capabilityKey },
      }
    );
  };
}

export function createPluginCapabilityAPI({ namespace, granted, logger }) {
  const { assertUserCapability, requireAuthz } = createPluginAuthHelpers({ logger });
  const assertPlatformCapability = createPlatformCapabilityAsserter(namespace, granted);

  return {
    assertPlatformCapability,
    assertUserCapability,
    requireAuthz,
  };
}
