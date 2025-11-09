export const iconRegistry = {
  default: {
    viewBox: "0 0 24 24",
    body: `<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6" fill="none" />`,
  },
  "book-open": {
    viewBox: "0 0 24 24",
    body: [
      `<path d="M4.5 5.25C4.5 4.01 5.51 3 6.75 3H11v16H6.75A2.25 2.25 0 0 0 4.5 21.25V5.25Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />`,
      `<path d="M19.5 5.25C19.5 4.01 18.49 3 17.25 3H13v16h4.25c1.24 0 2.25 1.01 2.25 2.25V5.25Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />`,
      `<path d="M11.25 6.5H6.25M12.75 6.5H17.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />`,
    ].join(""),
  },
  timeline: {
    viewBox: "0 0 24 24",
    body: [
      `<path d="M5 8h14M5 16h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`,
      `<circle cx="9" cy="8" r="1.7" fill="currentColor" />`,
      `<circle cx="15" cy="16" r="1.7" fill="currentColor" />`,
    ].join(""),
  },
  archive: {
    viewBox: "0 0 24 24",
    body: [
      `<path d="M5.5 10.5h13v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />`,
      `<path d="M3 7h18l-2-4H5L3 7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />`,
      `<path d="M9 13h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`,
    ].join(""),
  },
  cog: {
    viewBox: "0 0 24 24",
    body: [
      `<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />`,
      `<path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.2 6.2l1.8 1.8M16 16l1.8 1.8M6.2 17.8l1.8-1.8M16 8l1.8-1.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />`,
    ].join(""),
  },
  split: {
    viewBox: "0 0 24 24",
    body: [
      `<path d="M7 5v7.5c0 .97.39 1.9 1.08 2.59L15 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`,
      `<path d="M17 5v6.5c0 .97-.39 1.9-1.08 2.59L9 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`,
      `<path d="M4.75 5H9M15 5h4.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`,
    ].join(""),
  },
  users: {
    viewBox: "0 0 24 24",
    body: [
      `<circle cx="15" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />`,
      `<circle cx="8.5" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5" />`,
      `<path d="M3.5 19c0-3 2.5-5 5.5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`,
      `<path d="M13 19c0-3 2.5-5 5.5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`,
    ].join(""),
  },
};

export function getIcon(name) {
  if (!name) return iconRegistry.default;
  return iconRegistry[name] || iconRegistry.default;
}
