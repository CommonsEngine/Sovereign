export const SovereignPermissions = {
  AuthProfile: "auth:profile",
  StorageReadWrite: "storage:readWrite",
  EventsPublish: "events:publish",
  NotificationsSend: "notifications:send",
  FilesPick: "files:pick",
} as const;

export type SovereignPermission =
  (typeof SovereignPermissions)[keyof typeof SovereignPermissions];

export const SovereignPermissionValues = Object.values(
  SovereignPermissions
) as SovereignPermission[];

export function isSovereignPermission(
  permission: string
): permission is SovereignPermission {
  return SovereignPermissionValues.includes(
    permission as SovereignPermission
  );
}
