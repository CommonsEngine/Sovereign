import { sovereign } from "../../../packages/sdk/src";

interface CreateAppSdkInput {
  appId: string;
  permissions: readonly string[];
}

export function createAppSdk(input: CreateAppSdkInput) {
  return {
    auth: input.permissions.includes("auth:profile")
      ? sovereign.auth
      : undefined,

    storage: input.permissions.includes("storage:readWrite")
      ? sovereign.storage
      : undefined,

    events: input.permissions.includes("events:publish")
      ? sovereign.events
      : undefined,

    notifications: input.permissions.includes("notifications:send")
      ? sovereign.notifications
      : undefined,
  };
}
