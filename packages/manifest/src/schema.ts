import { z } from 'zod';

/**
 * SDK capabilities a plugin may declare. Mirrors the `Permission` union in
 * SRS §5. Several are reserved for post-v1 (storage, notifications, events).
 */
export const permissionSchema = z.enum([
  'auth:session',
  'db:readWrite',
  'db:readOnly',
  'mailer:send',
  'storage:readWrite',
  'notifications:send',
  'events:publish',
  'events:subscribe',
  'admin:*',
]);

/**
 * The plugin manifest schema — the single source of truth for both runtime
 * validation and the exported TypeScript types (see ./types). Mirrors
 * SRS §5 Plugin Manifest Reference.
 *
 * `.strict()` rejects unknown keys so manifest typos fail the build rather than
 * being silently ignored. Forward compatibility is handled by `schemaVersion`.
 */
export const manifestSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    database: z.enum(['shared', 'isolated']).optional(),
    type: z.enum(['platform', 'sovereign', 'community']),
    runtime: z.enum(['native', 'static', 'iframe-local', 'iframe-remote', 'external']),
    routePrefix: z.string().min(1).startsWith('/', 'routePrefix must start with "/"'),
    permissions: z.array(permissionSchema),
    shell: z.enum(['default', 'minimal']).optional(),
    adminOnly: z.boolean().optional(),
    compatibility: z.object({
      minPlatformVersion: z.string().min(1),
    }),
    repository: z.string().url().optional(),
  })
  .strict()
  .refine((m) => m.type === 'platform' || m.repository !== undefined, {
    message: 'repository is required when type is "sovereign" or "community"',
    path: ['repository'],
  });
