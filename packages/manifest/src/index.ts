export * from "./validate";

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
  author?: string;
  license?: string;
  compatibility: {
    minPlatformVersion: string;
  };
}
