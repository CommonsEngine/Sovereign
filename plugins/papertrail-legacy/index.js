// Example-only hook implementation for the blog plugin lifecycle.
const lifecycleState = {
  installedAt: null,
  buildCount: 0,
  lastBuildId: null,
  enabledTenants: new Map(),
};

function timestamp() {
  return new Date().toISOString();
}

function emit(context, level, message, meta = undefined) {
  const logger = context?.logger;
  if (logger?.[level]) {
    logger[level](message, meta);
    return;
  }
  const payload = meta ? `${message} ${JSON.stringify(meta)}` : message;
  console.log(`[blog:${level}] ${payload}`);
}

export async function onInstall(context = {}) {
  if (lifecycleState.installedAt) {
    emit(context, "info", "Blog plugin already installed", {
      installedAt: lifecycleState.installedAt,
    });
    return {
      action: "onInstall",
      skipped: true,
      installedAt: lifecycleState.installedAt,
    };
  }

  lifecycleState.installedAt = timestamp();
  emit(context, "info", "Blog plugin installed", {
    installedAt: lifecycleState.installedAt,
  });

  return {
    action: "onInstall",
    installedAt: lifecycleState.installedAt,
    migrations: ["001_init_blog_tables.sql", "002_seed_initial_posts.sql"],
  };
}

export async function onBuild(context = {}) {
  lifecycleState.buildCount += 1;
  lifecycleState.lastBuildId = `blog-build-${Date.now().toString(36)}-${lifecycleState.buildCount}`;

  emit(context, "info", "Blog plugin assets built", {
    buildId: lifecycleState.lastBuildId,
    buildCount: lifecycleState.buildCount,
  });

  return {
    action: "onBuild",
    buildId: lifecycleState.lastBuildId,
    buildCount: lifecycleState.buildCount,
    artifacts: ["public/blog.js", "public/blog.css"],
  };
}

export async function onEnable(context = {}) {
  const tenantId = context?.tenantId ?? "tenant:default";
  lifecycleState.enabledTenants.set(tenantId, {
    enabledAt: timestamp(),
    buildId: lifecycleState.lastBuildId,
  });

  emit(context, "info", "Blog plugin enabled", {
    tenantId,
    buildId: lifecycleState.lastBuildId,
  });

  return {
    action: "onEnable",
    tenantId,
    buildId: lifecycleState.lastBuildId,
    enabledAt: lifecycleState.enabledTenants.get(tenantId).enabledAt,
  };
}

export async function onDisable(context = {}) {
  const tenantId = context?.tenantId ?? "tenant:default";
  const wasEnabled = lifecycleState.enabledTenants.delete(tenantId);

  emit(context, wasEnabled ? "info" : "warn", "Blog plugin disabled", {
    tenantId,
    wasEnabled,
  });

  return {
    action: "onDisable",
    tenantId,
    wasEnabled,
  };
}

export async function onRemove(context = {}) {
  const snapshot = {
    installedAt: lifecycleState.installedAt,
    buildCount: lifecycleState.buildCount,
    tenants: Array.from(lifecycleState.enabledTenants.keys()),
  };

  lifecycleState.installedAt = null;
  lifecycleState.buildCount = 0;
  lifecycleState.lastBuildId = null;
  lifecycleState.enabledTenants.clear();

  emit(context, "info", "Blog plugin removed", snapshot);

  return {
    action: "onRemove",
    removedAt: timestamp(),
    snapshot,
  };
}

export default {
  onInstall,
  onBuild,
  onEnable,
  onDisable,
  onRemove,
};
