import type { InstalledSovereignApp } from "./types";

interface ExternalAppRuntimeProps {
  app: InstalledSovereignApp;
}

export function ExternalAppRuntime({ app }: ExternalAppRuntimeProps) {
  const external = app.runtimeConfig?.external;

  if (!external || !isHttpsUrl(external.url)) {
    return <p>External runtime URL not configured.</p>;
  }

  return (
    <section>
      <p>{app.name} runs outside the Sovereign runtime.</p>
      <p>
        <a href={external.url} target="_blank" rel="noreferrer">
          Open {app.name}
        </a>
      </p>
    </section>
  );
}

function isHttpsUrl(input: string) {
  try {
    return new URL(input).protocol === "https:";
  } catch {
    return false;
  }
}
