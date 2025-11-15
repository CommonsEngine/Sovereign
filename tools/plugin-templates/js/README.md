# {{DISPLAY_NAME}}

{{DESCRIPTION}}

## Getting Started

1. Install dependencies inside this plugin directory: `yarn install`.
2. Start the Sovereign platform (`yarn dev` at repo root) so routes are mounted.
3. Add routes, views, and Prisma models as needed under `routes/`, `views/`, and `prisma/`.

## Development Notes

- API routes live in `routes/api`, web routes in `routes/web`.
- Export lifecycle hooks or helpers from `index.js` if you need installation/build logic.
- `plugin.json` controls capabilities, entry points, and compatibility metadata.
