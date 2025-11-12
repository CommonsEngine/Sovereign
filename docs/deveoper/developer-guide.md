### Database & Prisma workflow

The canonical schema now lives in three layers:

1. `platform/prisma/base.prisma` – datasource + generator + shared core models.
2. `plugins/<name>/prisma/extension.prisma` – ONLY plugin-owned enums/models (no datasource/generator blocks, no duplicates of core tables).
3. `platform/prisma/schema.prisma` – generated file that concatenates the base schema with every plugin extension.

Run `yarn prisma:compose` (or `yarn workspace @sovereign/platform prisma:compose`) any time you change a schema file; all Prisma scripts in the platform workspace trigger this automatically. Use `yarn prisma:compose:check` (root) or `yarn workspace @sovereign/platform prisma:compose:check` in CI to ensure the generated schema is up-to-date.

To add plugin data models:

- Create/append `plugins/<plugin>/prisma/extension.prisma`.
- Define plugin-specific enums/models that reference base models via relations as needed.
- Keep the file scoped—no datasource/generator blocks or edits to shared tables.
- Run `yarn prisma:compose` followed by your usual Prisma command (`prisma:generate`, `prisma:migrate`, etc.). The composed schema will be re-formatted automatically.

> ⚠️ Never edit `platform/prisma/schema.prisma` by hand; it will be overwritten by the compose step.

6. Updating Prisma schema and apply migrations
   - Update `platform/prisma/base.prisma` (or `plugins/<ns>/prisma/extension.prisma` for plugin-owned tables) and re-run `yarn prisma:compose`.
   - Run `yarn prisma validate` and `yarn prisma format` to ensure the schema is valid and formatted.
   - Run the migration command to log the change with `yarn prisma migrate dev --name <migration_name_in_snake_case>`.

> You can always run `yarn reset:all` for fresh start.

#### React / JSX Support (Server-Side Rendering + Client Hydration)

The Sovereign Express/Handlebars stack also supports for **React / JSX views** (alonegside Handlebars) rendered via **server-side rendering (SSR)** with optional **client-side hydration** using [Vite](https://vite.dev/) middleware.

This hybrid setup allows you to:

- Keep using Handlebars for static pages, layouts, and emails.
- Add React components or entire pages where interactivity or component reuse is needed.
- Render React SSR directly from Express routes using `res.renderJSX()`.

##### How It Works

A custom Express helper/middleware, `res.renderJSX(viewPath, props)`, is available to render React components server-side:

- It automatically resolves the module under `/src/views/${viewPath}.{jsx,tsx,ts,js}`.
- Uses React's SSR API to generate HTML and embed initial props.
- Automatically injects a matching client bundle (e.g. `.client.jsx`) for hydration during development.

##### Creating a JSX Route

Example route (from `src/index.mjs`):

```js
app.get("/example/react/*", requireAuth, exposeGlobals, async (req, res, next) => {
  try {
    await res.renderJSX("example/react/index", {
      path: req.params[0] || "",
    });
  } catch (err) {
    next(err);
  }
});
```

The above renders the React component from `src/views/example/react/index.jsx`.

##### Creating a React / JSX View

Example file: `src/views/example/react/index.jsx`

```jsx
import React from "react";
import { Routes, Route, useParams, StaticRouter } from "react-router";
import { BrowserRouter, Link } from "react-router-dom";

function IndexPage() {
  return (
    <section>
      <h2>Index Page (React App)</h2>
      <p>
        <Link to="/page/123">Go to Page 123</Link>
      </p>
    </section>
  );
}

function PageById() {
  const { id } = useParams();
  return (
    <section>
      <h2>Page {id}</h2>
      <p>Welcome!</p>
    </section>
  );
}

export default function ReactApp({ url }) {
  const basename = "/example/react";
  const isServer = typeof window === "undefined";

  const content = (
    <>
      <header>
        <h1>React App</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Index Page</Link>
          <Link to="/page/123">Page 123</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/page/:id" element={<PageById />} />
      </Routes>
    </>
  );

  return isServer ? (
    <StaticRouter location={url} basename={basename}>
      {content}
    </StaticRouter>
  ) : (
    <BrowserRouter basename={basename}>{content}</BrowserRouter>
  );
}
```

##### Adding Client Hydration (Optional)

To hydrate the JSX page on the client, create a matching `.client.jsx` file in the same folder:

```jsx
// src/views/example/react/index.client.jsx
import React from "react";
import { hydrateRoot } from "react-dom/client";
import ReactApp from "./index.jsx";

hydrateRoot(document.getElementById("app"), <ReactApp {...window.__SSR_PROPS__} />);
```

When running in development (`yarn dev`), Vite automatically loads this client entry to hydrate the SSR HTML.

##### Notes

- JSX/TSX files are stored under `/src/views/`, mirroring the Handlebars template structure.
- In development, Vite runs in middleware mode (with HMR and JSX/TSX support).
- Production builds can extend Vite configuration to include client bundles for hydration.
- React Router v7+ is supported (`StaticRouter` from `react-router`, `BrowserRouter` from `react-router-dom`).
- Handlebars and React can be mixed — e.g., Handlebars layout wrapping a React-rendered `<div id="app">` island.

### Module aliases

The project uses a simple `$` alias that points to the `src/` directory. Instead of long relative paths like:

```js
import logger from "../../services/logger.mjs";
```

use:

```js
import logger from "$/services/logger.mjs";
```

Please note this is supported for `platform` codebase only. The alias works for app code, tests, and development scripts (configured via a custom loader in `scripts/alias-loader.mjs`).

#### Key implementation notes

- AppSetting.value is a JSON column — it accepts objects, arrays, primitives and strings. Plain strings are stored as JSON strings.
- Feature flags: any env var prefixed with `FT_` will be included in `feature.flags` by the seed script (unless `ALLOWED_FEATURES` whitelist is set).
- User/email creation in seed and registration flows:
  - User created first (without primaryEmailId)
  - UserEmail created and linked with `userId`
  - User updated with `primaryEmailId` referencing created email
- Email delivery: configure `EMAIL_SMTP_URL` or `EMAIL_SMTP_HOST`/`EMAIL_SMTP_PORT` with credentials plus `EMAIL_FROM_*` env vars; toggle the `feature.email.delivery.bypass` app setting (or `EMAIL_DELIVERY_BYPASS` env var) to disable outbound email while keeping logs for development.
- Session RBAC snapshot:
  - Sessions may store a server-side `roles` and `capabilities` JSON to avoid repeated RBAC DB queries.
  - If roles/capabilities change, sessions must be invalidated or refreshed; consider versioning or updating session rows on changes. (To be implemented)

#### Troubleshooting

- "table ... does not exist": run migrations (`yarn prisma migrate deploy` / `yarn prisma migrate dev`) and `yarn prisma generate`.
- VersionRegistry increments: seed logic should update VersionRegistry once, not per-config. If values are unexpectedly high, ensure the upsert is executed only once.
