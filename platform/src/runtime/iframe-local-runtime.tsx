import type { InstalledSovereignApp } from "./types";

interface IframeLocalRuntimeProps {
  app: InstalledSovereignApp;
}

export function IframeLocalRuntime({ app }: IframeLocalRuntimeProps) {
  const iframeLocal = app.runtimeConfig?.iframeLocal;

  if (!iframeLocal) {
    return <p>Iframe runtime entrypoint not configured.</p>;
  }

  const entrypointFileName = iframeLocal.entrypoint.split("/").at(-1);

  if (!entrypointFileName) {
    return <p>Iframe runtime entrypoint not configured.</p>;
  }

  return (
    <iframe
      title={app.name}
      src={`/api/apps/${encodeURIComponent(app.id)}/iframe/${encodeURIComponent(entrypointFileName)}`}
      sandbox="allow-forms allow-scripts"
      style={{
        width: "100%",
        minHeight: "720px",
        border: 0,
      }}
    />
  );
}
