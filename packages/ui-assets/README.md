## @sovereign/ui-assets

Central registry for Sovereign plugin UI primitives (icons and palette tokens). Plugins refer to these assets by name in their `plugin.json` files and the manifest builder resolves/validates the references so the platform can render a consistent UI.

### Usage

- **Icons** – reference `ui.icon.name` in `plugin.json`. The manifest build converts it into inline SVG markup sourced from `iconRegistry`.
- **Palette tokens** – assign semantic slots (e.g., `primary`, `accent`) to any key exported in `paletteTokens`. The builder validates tokens and surfaces the hex value in the generated manifest.

Extensions that need the canonical definitions can import the helpers:

```js
import { getIcon, getPaletteColor } from "@sovereign/ui-assets";
```
