

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
  "version": "0.0.0",
  "runtime": "route-source",
  "permissions": [
    "storage:readWrite"
  ],
  "compatibility": {
    "minPlatformVersion": "0.1.0"
  }
}
```

---

# Runtime Model

Current runtime types:

```txt
route-source
iframe-local
iframe-remote
external
```

Initial versions of Sovereign focus on:

```txt
route-source
```

apps built directly into the platform runtime.

Sandboxed runtimes will be introduced later.

---

# Capability Model

Sovereign uses a capability-based permission system.

Examples:

```txt
auth:profile
storage:readWrite
notifications:send
files:pick
events:publish
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
yarn validate:manifest plugins/com.sovereign.launcher/manifest.json
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