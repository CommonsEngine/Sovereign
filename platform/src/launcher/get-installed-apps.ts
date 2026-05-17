import { installedApps } from "../../generated/apps.generated";

export function getInstalledApps() {
  return installedApps;
}

export function getLauncherApps() {
  return installedApps.filter(
    (app) => app.extensionPoints?.launcher === true
  );
}
