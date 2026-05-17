import { Suspense } from "react";

import { createAppSdk } from "../sdk";
import { IframeLocalRuntime } from "./iframe-local-runtime";
import { IframeRemoteRuntime } from "./iframe-remote-runtime";
import type { InstalledSovereignApp } from "./types";

interface RenderAppRuntimeProps {
  app: InstalledSovereignApp;
}

export async function RenderAppRuntime({ app }: RenderAppRuntimeProps) {
  switch (app.runtime) {
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
      return <IframeLocalRuntime app={app} />;

    case "iframe-remote":
      return <IframeRemoteRuntime app={app} />;

    case "external":
      return <p>{app.name} opens as an external app.</p>;

    default:
      return null;
  }
}
