import type { ComponentType } from "react";

import type { SovereignAppManifest } from "../../../packages/manifest/src";
import type { SovereignAppProps } from "../../../packages/sdk/src";

export type StandaloneAppModule = () => Promise<{
  default: ComponentType<SovereignAppProps>;
}>;

export type InstalledSovereignApp = SovereignAppManifest & {
  pluginDirectory: string;
  module?: StandaloneAppModule;
};
