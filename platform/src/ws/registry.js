let realtimeHubInstance = null;
const pluginInitializers = new Set();

export function setRealtimeHubInstance(hub) {
  realtimeHubInstance = hub;
  for (const init of pluginInitializers) {
    try {
      init(hub);
    } catch (err) {
      console.error("[ws] realtime plugin init failed", err);
    }
  }
}

export function registerRealtimePlugin(init) {
  if (typeof init !== "function") return;
  pluginInitializers.add(init);
  if (realtimeHubInstance) {
    try {
      init(realtimeHubInstance);
    } catch (err) {
      console.error("[ws] realtime plugin init failed", err);
    }
  }
}
