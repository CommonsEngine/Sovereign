const enabledByNamespace = new Map();
const enabledByPluginId = new Map();

const normalizeEnabled = (plugin) => {
  if (!plugin) return true;
  // Treat explicit false as disabled; anything else defaults to enabled.
  return plugin.enabled !== false;
};

function setState(plugin) {
  if (!plugin) return;
  const enabled = normalizeEnabled(plugin);
  if (plugin.namespace) {
    enabledByNamespace.set(plugin.namespace, enabled);
  }
  if (plugin.pluginId) {
    enabledByPluginId.set(plugin.pluginId, enabled);
  }
}

export function seedPluginRuntimeState(plugins = {}) {
  enabledByNamespace.clear();
  enabledByPluginId.clear();
  Object.values(plugins || {}).forEach((plugin) => setState(plugin));
}

export function updatePluginRuntimeState(plugins = []) {
  const list = Array.isArray(plugins) ? plugins : [plugins];
  list.forEach((plugin) => setState(plugin));
}

export function isPluginEnabled(ref) {
  if (!ref) return true;
  if (enabledByNamespace.has(ref)) {
    return enabledByNamespace.get(ref);
  }
  if (enabledByPluginId.has(ref)) {
    return enabledByPluginId.get(ref);
  }
  return true;
}
