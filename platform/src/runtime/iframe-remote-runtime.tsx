import type { InstalledSovereignApp } from "./types";

interface IframeRemoteRuntimeProps {
  app: InstalledSovereignApp;
}

export function IframeRemoteRuntime({ app }: IframeRemoteRuntimeProps) {
  const iframeRemote = app.runtimeConfig?.iframeRemote;

  if (!iframeRemote || !isHttpsUrl(iframeRemote.url)) {
    return <p>Remote iframe runtime URL not configured.</p>;
  }

  return (
    <iframe
      title={app.name}
      src={iframeRemote.url}
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

function isHttpsUrl(input: string) {
  try {
    return new URL(input).protocol === "https:";
  } catch {
    return false;
  }
}
