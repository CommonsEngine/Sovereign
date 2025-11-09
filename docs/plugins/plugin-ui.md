# Plugin UI

## Plugin UI metadata

Every `plugin.json` can describe how it should appear inside the platform shell via a `ui` block. Plugins pick an icon and color tokens from the shared `@sovereign/ui-assets` package and specify whether the sidebar or header should render when the module is active.

```json
"ui": {
  "icon": { "name": "book-open" },
  "palette": {
    "primary": "violet-500",
    "accent": "amber-400"
  },
  "layout": {
    "sidebar": true,
    "header": true
  }
}
```

- `icon.name` must match a key in `packages/ui-assets/icons.js`. If omitted, the default glyph is used.
- Palette slots point to `packages/ui-assets/palettes.js` tokens. During manifest generation each token is validated and resolved to its hex color.
- `layout.sidebar` / `layout.header` default to `true`. Set them to `false` to hide the entire sidebar or header when the plugin is active (full-bleed experiences).
- Use the top-level `sidebarHidden` flag when you simply want to keep that module’s icon out of the navigation while the rest of the shell stays intact.

To contribute a new visual, add it to `packages/ui-assets` first, then reference it by name from the plugin manifest.
