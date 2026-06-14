import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';

/** Absolute path to the shared avatar directory (workspace-root `data/avatars`). */
export function avatarsDir(): string {
  return join(findWorkspaceRoot(), 'data', 'avatars');
}

/** The stored avatar file for a user (`<user_id>.<ext>`), or null if none. */
export function findAvatarFile(userId: string): string | null {
  const dir = avatarsDir();
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find((e) => e === userId || e.startsWith(`${userId}.`));
  return match ? join(dir, match) : null;
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Content type for a stored avatar's extension; defaults to octet-stream. */
export function avatarContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}
