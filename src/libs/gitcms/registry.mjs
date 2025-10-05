import path from 'path';

import GitManager from './git.mjs';

const managers = new Map();

export function getGitManager(projectId) {
  return managers.get(projectId) || null;
}

export async function getOrInitGitManager(projectId, cfg) {
  const existing = managers.get(projectId);
  if (existing) return existing;

  const gm = new GitManager({
    repoUrl: cfg.repoUrl,
    branch: cfg.branch || cfg.defaultBranch || 'main',
    userName: cfg.userName || cfg.gitUserName || 'Sovereign',
    userEmail: cfg.userEmail || cfg.gitUserEmail || 'noreply@sovereign.local',
    authToken: cfg.authToken || cfg.gitAuthToken || null,
    localPath: path.join(process.cwd(), 'data', projectId),
  });

  await gm.initialize();
  managers.set(projectId, gm);
  return gm;
}

export function disposeGitManager(projectId) {
  managers.delete(projectId);
}
