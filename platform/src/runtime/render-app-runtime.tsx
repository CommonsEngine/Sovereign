import type { SovereignAppManifest } from "../../../packages/manifest/src";

interface RenderAppRuntimeProps {
  app: SovereignAppManifest;
}

export function RenderAppRuntime({ app }: RenderAppRuntimeProps) {
  switch (app.runtime) {
    case "route-source":
      return (
        <section>
          <h2>Route Source Runtime</h2>
          <p>{app.name} will be mounted here.</p>
        </section>
      );

    case "iframe-local":
    case "iframe-remote":
      return (
        <section>
          <h2>Sandbox Runtime</h2>
          <p>{app.name} will run inside an iframe sandbox.</p>
        </section>
      );

    case "external":
      return (
        <section>
          <h2>External Runtime</h2>
          <p>{app.name} opens as an external app.</p>
        </section>
      );

    default:
      return null;
  }
}