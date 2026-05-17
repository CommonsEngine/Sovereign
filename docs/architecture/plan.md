

# Sovereign Architecture Plan

## Vision

Sovereign is a modular, self-hostable personal platform and workspace runtime.

The platform is designed around these principles:

- PWA-first architecture
- Self-hostable and developer-owned deployments
- Modular app/plugin ecosystem
- Shared authentication and capability model
- Progressive enhancement toward native/mobile runtime support
- Platform-controlled permissions and runtime boundaries
- Extensible application launcher and workspace model

The long-term goal is to evolve Sovereign into a flexible application platform capable of hosting:

- Personal workspace apps
- Productivity tools
- AI-powered workflows
- Internal business systems
- Community-developed Sovereign Apps

---

# Core Architectural Philosophy

Sovereign should be treated as:

```txt
Platform Runtime + Capability Layer + App Ecosystem
```

NOT:

```txt
A single monolithic web application
```

The platform itself acts as:

- Application shell
- Identity provider
- Capability manager
- Runtime orchestrator
- App launcher
- Shared UI/runtime layer
- Future native bridge

---

# High-Level Architecture

```txt
Sovereign
├─ platform/          # Sovereign Core runtime
├─ packages/          # Shared SDKs, schemas, tooling
├─ plugins/           # Installed Sovereign Apps
├─ registry/          # Public app registry metadata
├─ templates/         # App starter templates
├─ tools/             # Build/runtime tooling
└─ docs/              # Documentation
```

---

# Platform Strategy

## Core Platform

The platform runtime lives under:

```txt
/platform
```

The platform is responsible for:

- Authentication
- Permission enforcement
- Runtime orchestration
- App launching
- Event bus
- Storage abstraction
- SDK bridge
- Routing
- App registry resolution
- Native bridge abstraction
- Console/admin functionality

---

# `/platform/app`

This directory contains the Next.js App Router surface.

Purpose:

- HTTP/UI layer
- Framework integration layer
- Route handling
- Layout composition
- API entrypoints
- Request orchestration

This layer should remain thin and delegate most logic into `/platform/src`.

Example:

```txt
platform/app/
├─ apps/
├─ api/
├─ console/
├─ install/
├─ settings/
├─ layout.tsx
└─ page.tsx
```

---

# `/platform/src`

This directory contains the actual Sovereign platform runtime and architecture.

Purpose:

- Runtime systems
- Permission engine
- App registry resolution
- SDK implementation
- Capability management
- Event system
- Runtime orchestration
- Sandbox handling
- Storage abstraction

Example:

```txt
platform/src/
├─ auth/
├─ bridge/
├─ capabilities/
├─ events/
├─ launcher/
├─ permissions/
├─ registry/
├─ runtime/
├─ sandbox/
├─ sdk/
└─ storage/
```

This separation keeps Sovereign architecture independent from Next.js conventions.

---

# `/platform/generated`

This directory contains machine-generated runtime metadata.

Generated files are created by the Sovereign CLI and build tooling.

Purpose:

- Static app imports
- Route compilation
- Permission compilation
- Extension point aggregation
- Runtime optimization
- Next.js-compatible static analysis

Example:

```txt
platform/generated/
├─ apps.generated.ts
├─ routes.generated.ts
├─ permissions.generated.ts
├─ extension-points.generated.ts
└─ registry.generated.json
```

Generated files should NEVER be edited manually.

---

# Plugin / App System

Sovereign Apps are modular applications installable into a Sovereign instance.

Apps may be:

- Core platform apps
- User-installed apps
- Community-developed apps
- Future sandboxed apps

Apps are installed under:

```txt
/plugins
```

Example:

```txt
plugins/
├─ com.sovereign.launcher/
├─ com.sovereign.files/
├─ com.example.notes/
└─ com.example.crm/
```

---

# Sovereign App Manifest

Each app contains:

```txt
manifest.json
```

The manifest defines:

- App identity
- Runtime type
- Permissions
- Extension points
- Routing
- Compatibility
- Launch behavior

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
  "author": "Sovereign Core Team",
  "license": "AGPL-3.0",
  "compatibility": {
    "minPlatformVersion": "0.1.0"
  }
}
```

---

# `/packages/manifest`

The manifest system is treated as a platform specification layer.

Purpose:

- Manifest schema
- Validation
- Normalization
- Compatibility handling
- Manifest versioning
- Runtime compilation helpers

Example:

```txt
packages/manifest/
├─ schema/
├─ src/
└─ README.md
```

This package becomes the canonical Sovereign App specification engine.

---

# `/packages/sdk`

Shared SDK exposed to Sovereign Apps.

The SDK provides controlled access to platform capabilities.

Example APIs:

```txt
sovereign.auth
sovereign.storage
sovereign.events
sovereign.notifications
sovereign.files
sovereign.device
```

Apps should NEVER access platform internals directly.

---

# Capability Model

Sovereign uses a capability-based permission system.

Apps request capabilities through their manifest.

Examples:

```txt
storage:readWrite
notifications:send
auth:profile
files:pick
events:publish
```

The platform validates and enforces permissions.

---

# Authentication Strategy

Apps should share identity context but not raw platform credentials.

Apps receive:

- User identity
- Permission-scoped SDK access
- Platform APIs through the Sovereign SDK

Apps should NOT receive:

- Raw JWTs
- Database credentials
- Internal session state
- Native bridge internals

Future sandboxed apps will communicate through:

```txt
postMessage + RPC bridge
```

---

# Launcher Strategy

The Sovereign platform acts as the application launcher.

Launch surfaces may include:

- Dashboard/home screen
- Sidebar
- Command palette
- Mobile launcher
- URL routing
- Workspace widgets

Launch modes:

```txt
route-source
iframe-local
iframe-remote
external
```

---

# `/registry`

Registry contains metadata about installable Sovereign Apps.

Purpose:

- App discovery
- Install metadata
- Version tracking
- Compatibility metadata
- Trust metadata

The registry does NOT host runtime app code.

Example:

```txt
registry/
├─ apps/
├─ index.json
├─ categories.json
└─ featured.json
```

---

# Sovereign CLI

The CLI is a core part of the platform ecosystem.

Responsibilities:

- Initialize projects
- Install apps
- Validate manifests
- Generate runtime metadata
- Manage registries
- Build/deploy tooling

Example commands:

```txt
sovereign init
sovereign dev
sovereign app install
sovereign app validate
sovereign app remove
sovereign app publish
sovereign deploy
```

---

# Runtime Trust Model

## Trusted Apps

Installed directly into the runtime.

Characteristics:

- Source-installed
- Built with the platform
- Deep platform integration
- Shared React runtime

---

## Sandboxed Apps (Future)

Isolated runtime using iframe-based execution.

Characteristics:

- Runtime isolation
- Capability bridge access
- Permission-gated communication
- Safer third-party ecosystem support

---

# Long-Term Direction

Sovereign should evolve toward:

```txt
Personal Platform Runtime
```

Supporting:

- Self-hosted deployments
- PWA distribution
- Native wrappers
- Multi-device synchronization
- Community app ecosystem
- Enterprise/private registries
- Sandboxed runtime isolation
- AI-native workflows

---

# Current Initial Scope

Phase 1 focuses on:

- Next.js-based platform runtime
- Source-installed trusted apps
- Shared SDK and manifest system
- Generated runtime metadata
- Sovereign CLI
- App launcher
- Self-hosted deployments
- PWA-first distribution

Advanced sandboxing and remote runtime systems will be introduced in later phases.