export * from "./validate";
export * from "./permissions";

export type SovereignRuntime =
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
  permissions: string[];
  launch: {
    path: string;
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
