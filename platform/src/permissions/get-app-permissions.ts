import { appPermissions } from "../../generated/permissions.generated";

export function getAppPermissions(appId: string) {
  return appPermissions[appId] ?? [];
}
