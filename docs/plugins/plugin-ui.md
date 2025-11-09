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

## Access scopes

The platform automatically derives access control from the `user:plugin.<namespace>.feature` capability declared under `sovereign.userCapabilities`. Roles listed on that capability (for example `"platform:admin"` or `"tenant:admin"`) become the required roles for:

- Navigating to the plugin’s routes (both web and API)
- Seeing the plugin entry inside the shell sidebar

If the capability or its `roles` array is omitted, the plugin is available to any authenticated user.

To flag built-in Sovereign plugins, set the optional top-level property:

```json
"corePlugin": true
```

Core plugins inherit the same access derivation but can be reported differently via tooling.

See `docs/plugins/plugin-ui.md` for the full contract and contribution workflow.

## Layout surfaces

- **Shell chrome**: When `ui.layout.sidebar`/`header` remain `true`, plugins render within the standard chrome. Shared breadcrumbs, avatars, and command bar remain visible.
- **Full-bleed modes**: Set either flag to `false` for experiences that need the entire viewport (e.g., dashboards, editors). The platform still injects global CSS tokens and fonts, so typography remains consistent.
- **Sidebar presence**: `ui.icon.sidebarHidden` hides only the navigation entry, not the plugin itself. Use this for utility plugins that should be reachable via deep links or buttons elsewhere in the UI.
- **Custom layouts**: Complex screens can import layout primitives from `packages/ui` or register their own styles, but keep gutters and padding aligned with the base spacing scale (multiples of `--space-s`).

## Design tokens & CSS

- Every plugin automatically inherits `platform/src/public/css/sv_base.css`, which defines color, spacing, and typography tokens. Reference the [Styling System](../architecture.md#styling-system) section for the full token list.
- Prefer CSS variables (e.g., `var(--color-bg-secondary)`) over hard-coded colors to ensure light/dark themes stay in sync.
- Use `@layer plugin.<namespace>` if you need to ship shared CSS with predictable specificity. The base layer already handles resets and primitives, so plugin layers can stay minimal.
- Components shared between plugins should live in `packages/ui` (or another workspace package) so they can be versioned independently.

## Capability linkage

- The visibility rules described above depend on the capability you register in `sovereign.userCapabilities`. Document those capabilities in `docs/plugins/capabilities.md` (or reference an existing one) so reviewers can trace why a plugin is hidden or restricted.
- When a plugin offers multiple surfaces (e.g., reader vs. admin), declare additional capabilities such as `user:plugin.blog.post.read` / `.manage` and map them to different routes. The router can then call `ctx.pluginAuth.require({ capabilities: [...] })` to enforce the same policy server-side.
- For more detail about how platform/user capabilities flow into runtime contexts, see `docs/architecture.md#capability-model`.
