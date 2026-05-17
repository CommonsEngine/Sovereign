import { sovereign } from "../../../packages/sdk/src";
import { hasPermission } from "../permissions";

interface CreateAppSdkInput {
  appId: string;
  permissions: readonly string[];
}

export function createAppSdk(input: CreateAppSdkInput) {
  return {
    auth: hasPermission(input.permissions, "auth:profile")
      ? sovereign.auth
      : undefined,

    storage: hasPermission(input.permissions, "storage:readWrite")
      ? sovereign.storage
      : undefined,

    events: hasPermission(input.permissions, "events:publish")
      ? sovereign.events
      : undefined,

    notifications: hasPermission(input.permissions, "notifications:send")
      ? sovereign.notifications
      : undefined,
  };
}
