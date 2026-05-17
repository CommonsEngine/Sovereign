import { Suspense, type ComponentType } from "react";

import { IframeLocalRuntime } from "./iframe-local-runtime";
import type { InstalledSovereignApp } from "./types";

interface RenderAppRuntimeProps {
  app: InstalledSovereignApp;
  appPath?: readonly string[];
}

export async function RenderAppRuntime({
  app,
  appPath = [],
}: RenderAppRuntimeProps) {
  switch (app.runtime) {
    case "standalone": {
      if (app.runtimeConfig?.engine === "html") {
        return <IframeLocalRuntime app={app} appPath={appPath} />;
      }

      if (!app.module) {
        return <p>App module not found.</p>;
      }

      const AppModule = await app.module();
      const AppComponent = AppModule.default as ComponentType;

      return (
        <Suspense fallback={<p>Loading app...</p>}>
          <AppComponent />
        </Suspense>
      );
    }

    case "dom":
    case "iframe":
      return <IframeLocalRuntime app={app} appPath={appPath} />;

    default:
      return null;
  }
}
