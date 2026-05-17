import { sovereign } from "../../../packages/sdk/src";
import { SovereignPermissions } from "../../../packages/manifest/src";

import { getAppPermissions, hasPermission } from "../permissions";

interface CreateAppSdkInput {
  appId: string;
}

export function createAppSdk(input: CreateAppSdkInput) {
  const permissions = getAppPermissions(input.appId);

  return {
    auth: hasPermission(permissions, SovereignPermissions.AuthProfile)
      ? sovereign.auth
      : undefined,

    storage: hasPermission(permissions, SovereignPermissions.StorageReadWrite)
      ? sovereign.storage
      : undefined,

    events: hasPermission(permissions, SovereignPermissions.EventsPublish)
      ? sovereign.events
      : undefined,

    notifications: hasPermission(permissions, SovereignPermissions.NotificationsSend)
      ? sovereign.notifications
      : undefined,
  };
}
