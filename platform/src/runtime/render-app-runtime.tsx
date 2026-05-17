import { Suspense, type ComponentType } from "react";

import { createAppSdk } from "../sdk";
import { ExternalAppRuntime } from "./external-app-runtime";
import { IframeLocalRuntime } from "./iframe-local-runtime";
import { IframeRemoteRuntime } from "./iframe-remote-runtime";
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
    case "internal": {
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

    case "route-source": {
      if (!app.module) {
        return <p>App module not found.</p>;
      }

      const AppModule = await app.module();
      const AppComponent = AppModule.default;

      const sdk = createAppSdk({
        appId: app.id,
      });

      return (
        <Suspense fallback={<p>Loading app...</p>}>
          <AppComponent sdk={sdk} />
        </Suspense>
      );
    }

    case "iframe-local":
      return <IframeLocalRuntime app={app} appPath={appPath} />;

    case "iframe-remote":
      return <IframeRemoteRuntime app={app} />;

    case "external":
      return <ExternalAppRuntime app={app} />;

    default:
      return null;
  }
}
