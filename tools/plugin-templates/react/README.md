# {{DISPLAY_NAME}}

{{DESCRIPTION}}

## Development

1. Install dependencies: `yarn install`
2. Run `yarn dev` to start Vite on `{{DEV_ORIGIN}}`.
3. In another terminal start the Sovereign platform (`yarn dev` at repo root) so the plugin mounts under `/plugins/{{NAMESPACE}}`.

## Production build

`yarn build` emits `dist/index.js` (IIFE bundle) and `dist/assets/*`. Ship those files with the plugin to serve without the dev server.
