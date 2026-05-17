import { notFound } from "next/navigation";

import { resolveApp } from "../../../../src/launcher";
import { AppRuntimeShell, RenderAppRuntime } from "../../../../src/runtime";

interface AppPageProps {
  params: Promise<{
    appId: string;
    appPath?: string[];
  }>;
}

export default async function AppPage({ params }: AppPageProps) {
  const { appId, appPath = [] } = await params;
  const app = resolveApp(appId);

  if (!app) {
    notFound();
  }

  return (
    <AppRuntimeShell app={app}>
      <RenderAppRuntime app={app} appPath={appPath} />
    </AppRuntimeShell>
  );
}
