import { notFound } from "next/navigation";

import { getInstalledApps } from "../../../src/launcher";

interface AppPageProps {
  params: Promise<{
    appId: string;
  }>;
}

export default async function AppPage({ params }: AppPageProps) {
  const { appId } = await params;
  const apps = getInstalledApps();
  const app = apps.find((item) => item.id === appId);

  if (!app) {
    notFound();
  }

  return (
    <main>
      <a href="/">← Back to Launcher</a>

      <h1>{app.name}</h1>
      <p>{app.id}</p>
      <p>Runtime: {app.runtime}</p>

      <section>
        <h2>App Runtime Placeholder</h2>
        <p>This is where the Sovereign App runtime will mount.</p>
      </section>
    </main>
  );
}
