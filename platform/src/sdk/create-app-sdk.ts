import { sovereign } from "../../../packages/sdk/src";
import { SovereignPermissions } from "../../../packages/manifest/src";

import { hasPermission } from "../permissions";

interface CreateAppSdkInput {
  appId: string;
  permissions: readonly string[];
}

export function createAppSdk(input: CreateAppSdkInput) {
  return {
    auth: hasPermission(input.permissions, SovereignPermissions.AuthProfile)
      ? sovereign.auth
      : undefined,

    storage: hasPermission(input.permissions, SovereignPermissions.StorageReadWrite)
      ? sovereign.storage
      : undefined,

    events: hasPermission(input.permissions, SovereignPermissions.EventsPublish)
      ? sovereign.events
      : undefined,

    notifications: hasPermission(input.permissions, SovereignPermissions.NotificationsSend)
      ? sovereign.notifications
      : undefined,
  };
}
