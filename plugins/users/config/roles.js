export const USER_ROLES = Object.freeze({
  "platform:admin": { label: "Platform Admin" },
  "platform:engineer": { label: "Platform Engineer" },
  "tenant:admin": { label: "Tenant Admin" },
  "platform:user": { label: "Platform User" },
  "project:admin": { label: "Project Admin" },
  "project:editor": { label: "Project Editor" },
  "project:contributor": { label: "Project Contributor" },
  "project:viewer": { label: "Project Viewer" },
  "project:guest": { label: "Project Guest" },
  automation_bot: { label: "Sovereign Bot" },
});

export const USER_ROLE_KEYS = Object.freeze(Object.keys(USER_ROLES));
