/**
 * Pure helpers for the `sv` CLI (see `bin/sv.ts`).
 *
 * Kept free of process orchestration so the branchy logic — plugin-id
 * resolution and the platform-plugin removal guard — is unit-testable in
 * isolation, mirroring the `scripts/install-plugins.ts` split.
 */
import { validateManifest } from '@sovereignfs/manifest';

/**
 * Directory names of the platform plugins that ship inside this monorepo. They
 * are committed (gitignore-allowlisted) and load-bearing — `sv plugin remove`
 * refuses to delete them. Matches the allowlist in the root `.gitignore`.
 */
export const PLATFORM_PLUGIN_DIRS = ['account', 'console', 'launcher'] as const;

/** Throw if `id` names a built-in platform plugin that must not be removed. */
export function assertRemovablePlugin(id: string): void {
  if ((PLATFORM_PLUGIN_DIRS as readonly string[]).includes(id)) {
    throw new Error(`"${id}" is a built-in platform plugin and cannot be removed.`);
  }
}

/**
 * Parse and validate a cloned plugin's `manifest.json` contents and return its
 * declared `id` — the directory name the plugin composes under (the same key
 * `generate-registry.ts` and the gitignore allowlist use). Throws on malformed
 * JSON or a manifest that fails validation.
 */
export function resolvePluginIdFromManifest(rawManifestJson: string): string {
  let json: unknown;
  try {
    json = JSON.parse(rawManifestJson);
  } catch (error) {
    throw new Error(`manifest.json is not valid JSON: ${(error as Error).message}`);
  }
  const result = validateManifest(json);
  if (!result.valid) {
    throw new Error(`Invalid manifest.json:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  return result.manifest.id;
}
