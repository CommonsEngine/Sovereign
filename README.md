

# Sovereign

Sovereign is a modular, self-hostable personal platform runtime.

It is designed as a PWA-first workspace platform capable of hosting installable Sovereign Apps with shared identity, permissions, storage, and runtime orchestration.

---

# Vision

Sovereign aims to evolve into:

```txt
Personal Platform Runtime
```

Supporting:

- Personal workspaces
- Productivity applications
- AI-native workflows
- Community-developed Sovereign Apps
- Self-hosted deployments
- Native/mobile runtime wrappers
- Shared platform capabilities
- Multi-device synchronization

---

# Core Concepts

## Sovereign Core

The platform runtime responsible for:

- Authentication
- Permission enforcement
- App orchestration
- Runtime lifecycle
- Shared storage abstractions
- Event system
- Application launcher
- SDK bridge
- Future native capability bridge

---

## Sovereign Apps

Sovereign Apps are modular applications installable into a Sovereign instance.

Apps may be:

- Core platform apps
- User-installed apps
- Community-developed apps
- Future sandboxed apps

Each app contains a:

```txt
manifest.json
```

which defines:

- Identity
- Runtime type
- Permissions
- Compatibility
- Extension points
- Launch behavior

---

# Repository Structure

```txt
Sovereign/
├─ docs/                 # Documentation
├─ packages/             # Shared packages (SDK, manifest, CLI, etc.)
├─ platform/             # Sovereign Core runtime
├─ plugins/              # Installed Sovereign Apps
├─ registry/             # Public app registry metadata
├─ templates/            # App starter templates
└─ tools/                # Build/runtime tooling
```

---

# Platform Architecture

```txt
platform/
├─ app/                  # Next.js App Router surface
├─ generated/            # Generated runtime metadata
├─ public/
├─ src/                  # Sovereign runtime internals
├─ next.config.ts
└─ package.json
```

## `/platform/app`

Framework-facing layer.

Responsible for:

- Routes
- Layouts
- API entrypoints
- Request orchestration
- UI composition

## `/platform/src`

Framework-independent platform runtime.

Responsible for:

- Runtime systems
- Permissions
- SDK implementation
- Capability handling
- Registry resolution
- Storage abstraction
- Sandbox/runtime orchestration

## `/platform/generated`

Machine-generated runtime metadata.

Generated from installed app manifests.

Examples:

- App registry
- Route registry
- Permission maps
- Extension point indexes

---

# Manifest System

Manifest tooling lives under:

```txt
packages/manifest
```

The manifest system provides:

- Schema validation
- Manifest normalization
- Compatibility handling
- Runtime metadata generation

Example:

```json
{
  "schemaVersion": 1,
  "id": "com.example.notes",
  "name": "Notes",
  "version": "0.1.0",
  "runtime": "standalone",
  "runtimeConfig": {
    "engine": "react"
  },
  "permissions": ["storage:readWrite"],
  "launch": {
    "path": "/apps/com.example.notes"
  },
  "extensionPoints": {
    "launcher": true,
    "sidebar": true
  },
  "compatibility": {
    "minPlatformVersion": "0.1.0"
  }
}
```

---

# Runtime Model

Current runtime types:

```txt
standalone
dom
iframe
```

## `standalone`

Apps loaded directly by the Sovereign platform.

Use this for trusted plugins that should be served or bundled by the platform itself.

Supported engines:

```txt
react
html
```

Example:

```json
{
  "runtime": "standalone",
  "runtimeConfig": {
    "engine": "react"
  }
}
```

Standalone HTML apps use a plugin-local entrypoint:

```json
{
  "runtime": "standalone",
  "runtimeConfig": {
    "engine": "html",
    "entrypoint": "index.html"
  }
}
```

## `dom`

Apps served by a DOM application server and embedded by Sovereign.

Use this for Vite, React, or other DOM app development servers.

Example:

```json
{
  "runtime": "dom",
  "runtimeConfig": {
    "engine": "react",
    "host": "localhost",
    "port": "4000"
  }
}
```

## `iframe`

Apps hosted in an iframe. The iframe can point at a local plugin entrypoint, a local dev server, or a remote host.

Local HTML entrypoint:

```json
{
  "runtime": "iframe",
  "runtimeConfig": {
    "engine": "html",
    "entrypoint": "iframe/index.html"
  }
}
```

Local or remote host:

```json
{
  "runtime": "iframe",
  "runtimeConfig": {
    "engine": "*",
    "host": "example.com",
    "https": true,
    "uri": "/#test"
  }
}
```

The current manifest schema uses flat `runtimeConfig` fields:

```txt
engine
entrypoint
host
port
https
uri
```

---

# Capability Model

Sovereign uses a capability-based permission system.

Examples:

```txt
auth:profile
auth:read
auth:write
storage:read
storage:write
notifications:send
notifications:recieve
fs:read
fs:write
events:publish
events:subscribe
```

Apps interact with platform features through the Sovereign SDK.

Apps should never directly access platform internals or raw credentials.

---

# Development

## Requirements

- Node.js 20+
- Yarn 4+

## Install Dependencies

```bash
yarn install
```

## Run Development Server

```bash
yarn dev
```

## Generate Runtime Metadata

```bash
yarn generate
```

## Validate App Manifest

```bash
yarn validate:manifest plugins/com.sovereign-demo.iframe-html/manifest.json
```

---

# Current Status

Sovereign is currently in early architectural development.

Current focus areas:

- Platform runtime foundation
- Manifest system
- Runtime metadata generation
- SDK architecture
- App runtime model
- Capability system
- Self-hosted deployment strategy

---

# License

AGPL-3.0
