import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import logger from "./logger.js";

const DEFAULT_SHARED_PROVIDER = process.env.PLUGIN_DATABASE_PROVIDER || "sqlite";
const PRISMA_LOG_LEVEL = process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

const PLUGIN_ID_SAFE_CHARS = /[^a-zA-Z0-9-_]+/g;

const sanitizePluginId = (pluginId = "") =>
  pluginId.replace(PLUGIN_ID_SAFE_CHARS, "-").replace(/^-+/, "").replace(/-+$/, "") || "plugin";

const ensureFile = async (filePath) => {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "");
  }
};

class SQLiteFileProvider {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.resolve(process.cwd(), "data/plugins");
  }

  async provision({ manifest, config = {}, context = {} }) {
    if (!manifest?.id) {
      throw new Error("Cannot provision SQLite database: manifest.id missing.");
    }

    const dir = config.dataDir
      ? path.isAbsolute(config.dataDir)
        ? config.dataDir
        : path.join(this.baseDir, config.dataDir)
      : this.baseDir;

    const fileName = `${sanitizePluginId(manifest.id)}.db`;
    const filePath = path.join(dir, fileName);

    await fs.mkdir(dir, { recursive: true });
    await ensureFile(filePath);

    logger.info(
      { pluginId: manifest.id, filePath, ...context },
      "Provisioned SQLite database for plugin."
    );

    return {
      mode: "exclusive-sqlite",
      provider: "sqlite",
      url: `file:${filePath}`,
      path: filePath,
    };
  }
}

export class PluginDatabaseManager {
  constructor(options = {}) {
    this.sharedDatasourceUrl =
      options.sharedDatasourceUrl ||
      process.env.PLUGIN_DATABASE_URL ||
      process.env.DATABASE_URL ||
      null;

    this.sharedProvider = options.sharedProvider || DEFAULT_SHARED_PROVIDER;
    this.providers = new Map();
    this.datasourceCache = new Map();
    this.prismaCache = new Map();

    const sqliteBaseDir =
      options.sqlite?.baseDir || path.resolve(options.cwd || process.cwd(), "data/plugins");
    this.providers.set("exclusive-sqlite", new SQLiteFileProvider({ baseDir: sqliteBaseDir }));
  }

  sharedDescriptor() {
    if (!this.sharedDatasourceUrl) {
      throw new Error(
        "Shared plugin datasource URL is not configured. Set PLUGIN_DATABASE_URL or DATABASE_URL."
      );
    }

    return {
      mode: "shared",
      provider: this.sharedProvider,
      url: this.sharedDatasourceUrl,
    };
  }

  #cacheKey(manifest, context = {}) {
    return manifest?.id || context.namespace || context.pluginId || "plugin";
  }

  async resolveDatasource(manifest, context = {}) {
    const config = manifest?.sovereign?.database || { mode: "shared" };
    const mode = config.mode || "shared";

    if (mode === "shared") {
      return this.sharedDescriptor();
    }

    if (mode !== "exclusive-sqlite") {
      throw new Error(
        `Plugin database mode "${mode}" is not supported yet. Only "exclusive-sqlite" is available.`
      );
    }

    const provider = this.providers.get(mode);
    if (!provider) {
      throw new Error(`No provider available for plugin database mode "${mode}".`);
    }

    const cacheKey = `${mode}:${this.#cacheKey(manifest, context)}`;
    if (this.datasourceCache.has(cacheKey)) {
      return this.datasourceCache.get(cacheKey);
    }

    const descriptor = await provider.provision({ manifest, config, context });
    this.datasourceCache.set(cacheKey, descriptor);
    return descriptor;
  }

  async acquirePrismaClient(manifest, context = {}) {
    const cacheKey = this.#cacheKey(manifest, context);
    if (this.prismaCache.has(cacheKey)) {
      return this.prismaCache.get(cacheKey);
    }

    const descriptor = await this.resolveDatasource(manifest, context);
    if (descriptor.mode === "shared") {
      throw new Error(
        "acquirePrismaClient is intended for exclusive plugin databases. Shared mode should use the core Prisma client."
      );
    }

    const client = new PrismaClient({
      datasources: { db: { url: descriptor.url } },
      log: PRISMA_LOG_LEVEL,
    });

    this.prismaCache.set(cacheKey, client);
    return client;
  }
}

export default function createPluginDatabaseManager(options) {
  return new PluginDatabaseManager(options);
}
