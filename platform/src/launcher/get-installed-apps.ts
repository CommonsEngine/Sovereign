import { installedApps } from "../../generated/apps.generated";
import type { InstalledSovereignApp } from "../runtime";

export function getInstalledApps(): readonly InstalledSovereignApp[] {
  return installedApps;
}

export function getLauncherApps() {
  return installedApps.filter(
    (app) => app.extensionPoints?.launcher === true
  );
}

export function getSidebarApps() {
  return installedApps.filter(
    (app) => app.extensionPoints?.sidebar === true
  );
}
