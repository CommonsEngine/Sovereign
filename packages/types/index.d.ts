export type PluginCapabilityValue =
  | "allow"
  | "deny"
  | "consent"
  | "compliance"
  | "scoped"
  | "anonymized";

export type PluginDatabaseMode = "shared" | "exclusive-sqlite" | "exclusive-postgres";

export type PluginDatabaseProvider = "sqlite" | "postgresql" | "mysql";

export interface PluginDatabaseLimits {
  storageMb?: number;
  connections?: number;
}

export interface PluginDatabaseMigrations {
  directory?: string;
  entryPoint?: string;
}

export interface PluginDatabaseConfig {
  mode: PluginDatabaseMode;
  provider?: PluginDatabaseProvider;
  schema?: string;
  dataDir?: string;
  limits?: PluginDatabaseLimits;
  migrations?: PluginDatabaseMigrations;
}

export type PluginRoleAssignment =
  | string
  | {
      role: string;
      value?: PluginCapabilityValue | string;
    };

export interface PluginUserCapability {
  key: string;
  description?: string;
  roles: PluginRoleAssignment[];
}

export interface PluginSovereignMetadata {
  schemaVersion: number;
  allowMultipleInstances?: boolean;
  compat?: {
    platform?: string;
    node?: string;
  };
  database?: PluginDatabaseConfig;
  routes?: {
    web?: string;
    api?: string;
  };
  engine?: string;
  entryPoints?: string[] | Record<string, string>;
  platformCapabilities?: Record<string, boolean>;
  userCapabilities?: PluginUserCapability[];
  [key: string]: unknown;
}

export interface PluginManifest {
  id: string;
  namespace?: string;
  name: string;
  description?: string;
  version: string;
  type: "spa" | "custom";
  devOnly: boolean;
  draft?: boolean;
  author: string;
  license: string;
  entryPoints?: Record<string, string>;
  sidebarHidden?: boolean;
  sovereign: PluginSovereignMetadata;
  /** @deprecated Use sovereign.platformCapabilities instead. */
  platformCapabilities?: Record<string, boolean>;
  /** @deprecated Use sovereign.userCapabilities instead. */
  userCapabilities?: PluginUserCapability[];
}
