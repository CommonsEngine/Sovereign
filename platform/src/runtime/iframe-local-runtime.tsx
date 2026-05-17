import type { InstalledSovereignApp } from "./types";
import { IframeLocalFrame } from "./iframe-local-frame";

interface IframeLocalRuntimeProps {
  app: InstalledSovereignApp;
  appPath: readonly string[];
}

export function IframeLocalRuntime({ app, appPath }: IframeLocalRuntimeProps) {
  const iframeLocal = app.runtimeConfig?.iframeLocal;

  if (!iframeLocal) {
    return <p>Iframe runtime entrypoint not configured.</p>;
  }

  const entrypointFileName = iframeLocal.entrypoint.split("/").at(-1);

  if (!entrypointFileName) {
    return <p>Iframe runtime entrypoint not configured.</p>;
  }

  return (
    <IframeLocalFrame
      appId={app.id}
      appName={app.name}
      entrypointFileName={entrypointFileName}
      initialPath={toAppPath(appPath)}
    />
  );
}

function toAppPath(appPath: readonly string[]) {
  if (appPath.length === 0) {
    return "/";
  }

  return `/${appPath.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
