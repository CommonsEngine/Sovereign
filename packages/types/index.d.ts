export type PluginCapabilityValue =
  | "allow"
  | "deny"
  | "consent"
  | "compliance"
  | "scoped"
  | "anonymized";

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

export interface PluginUiIcon {
  name: string;
  variant?: string;
  viewBox?: string;
  body?: string;
  sidebarHidden?: boolean;
}

export interface PluginUiLayout {
  sidebar?: boolean;
  header?: boolean;
}

export type PluginUiPaletteValue =
  | string
  | {
      token: string;
      value: string;
    };

export interface PluginUiPalette {
  [slot: string]: PluginUiPaletteValue;
}

export interface PluginUiConfig {
  icon?: PluginUiIcon;
  palette?: PluginUiPalette;
  layout?: PluginUiLayout;
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
  ui?: PluginUiConfig;
  corePlugin?: boolean;
  sovereign: PluginSovereignMetadata;
  /** @deprecated Use sovereign.platformCapabilities instead. */
  platformCapabilities?: Record<string, boolean>;
  /** @deprecated Use sovereign.userCapabilities instead. */
  userCapabilities?: PluginUserCapability[];
}
