import { notFound } from "next/navigation";

import { resolveApp } from "../../../src/launcher";
import { AppRuntimeShell, RenderAppRuntime } from "../../../src/runtime";

interface AppPageProps {
  params: Promise<{
    appId: string;
  }>;
}

export default async function AppPage({ params }: AppPageProps) {
  const { appId } = await params;
  const app = resolveApp(appId);

  if (!app) {
    notFound();
  }

  return (
    <AppRuntimeShell app={app}>
      <RenderAppRuntime app={app} />
    </AppRuntimeShell>
  );
}
