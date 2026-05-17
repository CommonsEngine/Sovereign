import type { SovereignPermission } from "./permissions";

export * from "./validate";
export * from "./permissions";

export type SovereignRuntime =
  | "internal"
  | "route-source"
  | "iframe-local"
  | "iframe-remote"
  | "external";

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
    engine?: "vite:react-ts";
    iframeLocal?: {
      entrypoint: string;
    };
    iframeRemote?: {
      url: string;
    };
    external?: {
      url: string;
    };
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
