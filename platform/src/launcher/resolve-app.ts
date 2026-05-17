import { getInstalledApps } from "./get-installed-apps";

export function resolveApp(appId: string) {
  return getInstalledApps().find((app) => app.id === appId) ?? null;
}
