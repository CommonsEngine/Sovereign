import path from "node:path";

import createPluginDatabaseManager from "$/services/plugin-database-manager.js";

export default async function createExtHost(manifest, options = {}) {
  const dataDir =
    manifest.__datadir ||
    options.dataDir ||
    path.resolve(options.cwd || manifest.__rootdir || process.cwd(), "data");

  const pluginDatabaseManager = createPluginDatabaseManager({
    sqlite: {
      baseDir: path.join(dataDir, "plugins"),
    },
    sharedDatasourceUrl:
      options.sharedPluginDatasourceUrl ||
      process.env.PLUGIN_DATABASE_URL ||
      process.env.DATABASE_URL,
  });

  return {
    ...manifest,
    plugins: manifest.plugins,
    enabledPlugins: manifest.enabledPlugins,
    __assets: manifest.__assets,
    __pluginDatabaseManager: pluginDatabaseManager,
  };
}
