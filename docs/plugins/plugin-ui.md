# Plugin UI

## Plugin UI metadata

Plugins describe their visual footprint through the `ui` block inside `plugin.json`. Icons and colors are referenced by name from `packages/ui-assets`, and layout flags control whether the shared sidebar/header render when the plugin is active.

```json
"ui": {
  "icon": { "name": "book-open", "sidebarHidden": false },
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

- `ui.icon.name` must match an entry in `packages/ui-assets/icons.js`. Add new glyphs there first.
- Palette slots reference tokens defined in `packages/ui-assets/palettes.js`; the manifest builder validates and resolves them to hex values.
- `ui.layout.sidebar` / `ui.layout.header` default to `true`. Set them to `false` for full-bleed experiences that hide the entire shell chrome.
- Flip `ui.icon.sidebarHidden` to `true` to keep the plugin out of the sidebar navigation while leaving the rest of the shell visible.

See `docs/plugins/plugin-ui.md` for the full contract and contribution workflow.
