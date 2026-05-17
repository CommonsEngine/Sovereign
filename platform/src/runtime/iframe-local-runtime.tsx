import type { InstalledSovereignApp } from "./types";
import { IframeLocalFrame } from "./iframe-local-frame";

interface IframeLocalRuntimeProps {
  app: InstalledSovereignApp;
  appPath: readonly string[];
}

export function IframeLocalRuntime({ app, appPath }: IframeLocalRuntimeProps) {
  const entrypoint = app.runtimeConfig?.entrypoint;

  if (!entrypoint) {
    const remoteUrl = getRemoteIframeUrl(app);

    if (!remoteUrl) {
      return <p>Iframe runtime URL not configured.</p>;
    }

    return (
      <iframe
        title={app.name}
        src={remoteUrl}
        referrerPolicy="no-referrer"
        sandbox="allow-forms allow-scripts"
        style={{
          width: "100%",
          minHeight: "720px",
          border: 0,
        }}
      />
    );
  }

  const entrypointFileName = entrypoint.split("/").at(-1);

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

function getRemoteIframeUrl(app: InstalledSovereignApp) {
  const config = app.runtimeConfig;

  if (!config) {
    return null;
  }

  if (!config.host) {
    return null;
  }

  const protocol = config.https ? "https:" : "http:";
  const baseUrl = `${protocol}//${config.host}`;
  const url = new URL(config.uri ?? "/", baseUrl);

  if (config.port !== undefined) {
    url.port = String(config.port);
  }

  return url.toString();
}
function toAppPath(appPath: readonly string[]) {
  if (appPath.length === 0) {
    return "/";
  }

  return `/${appPath.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
