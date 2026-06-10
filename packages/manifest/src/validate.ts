import { manifestSchema } from './schema';
import type { SovereignManifest } from './types';

export type ValidationResult =
  | { valid: true; manifest: SovereignManifest }
  | { valid: false; errors: string[] };

/**
 * Validate an unknown value against the manifest schema. On success returns the
 * parsed, typed manifest; on failure returns a flat list of human-readable
 * `path: message` errors. Invalid manifests fail the build (SRS PLT-07).
 */
export function validateManifest(input: unknown): ValidationResult {
  const result = manifestSchema.safeParse(input);
  if (result.success) {
    return { valid: true, manifest: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
  return { valid: false, errors };
}
