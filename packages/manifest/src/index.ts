import type { SovereignPermission } from "./permissions";

export * from "./validate";
export * from "./permissions";

export type SovereignRuntime =
  | "internal"
  | "vite"
  | "iframe";

export type SovereignRuntimeEngine =
  | "react"
  | "html"
  | "*";

export interface SovereignAppManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  runtime: SovereignRuntime;
  permissions: SovereignPermission[];
  launch: {
    path: string;
  };
  runtimeConfig?: {
    engine?: SovereignRuntimeEngine;
    host?: string;
    port?: string | number;
    https?: boolean;
    uri?: string;
    entrypoint?: string;
  };
  extensionPoints?: {
    launcher?: boolean;
    sidebar?: boolean;
  };
  author?: string;
  license?: string;
  compatibility: {
    minPlatformVersion: string;
  };
}
