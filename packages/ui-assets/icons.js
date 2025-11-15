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
      `<path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke="currentColor"
          stroke-width="1.6"
        />`,
      `<path
          d="M19.4 13.5a7.9 7.9 0 0 0 0-3l2-1.6-2-3.5-2.4.7a8 8 0 0 0-2.6-1.5L14 2h-4l-.4 2.6a8 8 0 0 0-2.6 1.5l-2.4-.7-2 3.5 2 1.6a7.9 7.9 0 0 0 0 3l-2 1.6 2 3.5 2.4-.7a8 8 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8 8 0 0 0 2.6-1.5l2.4.7 2-3.5-2-1.6Z"
          stroke="currentColor"
          stroke-width="1.6"
        />`,
    ].join(""),
  },
  split: {
    viewBox: "0 0 24 24",
    body: [
      `<path d="M7 5v7.5c0 .97.39 1.9 1.08 2.59L15 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`,
    ].join(""),
  },
  users: {
    viewBox: "0 0 24 24",
    body: [
      `<path
          d="M15.5 10a3.5 3.5 0 1 0-3.001-5.25M10 10a3.5 3.5 0 1 1-6.999-1.001A3.5 3.5 0 0 1 10 10Z"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />`,
      `<path
          d="M2 18.5c.8-2.4 3.3-4 6-4s5.2 1.6 6 4M18 14.5c2.3 0 4.3 1.3 5 3.5"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />`,
    ].join(""),
  },
  tasks: {
    viewBox: "0 0 24 24",
    body: [
      `<path stroke-linecap="round" stroke-linejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122" />`,
    ].join(""),
  },
};

export function getIcon(name) {
  if (!name) return iconRegistry.default;
  return iconRegistry[name] || iconRegistry.default;
}
