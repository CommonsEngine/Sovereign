/* eslint-disable import/order */
import * as simpleGitPkg from 'simple-git';

const sg =
  typeof simpleGitPkg === 'function'
    ? simpleGitPkg
    : typeof simpleGitPkg.default === 'function'
    ? simpleGitPkg.default
    : simpleGitPkg.simpleGit;

import { promises as fs } from 'fs';
import path from 'path';

export default class GitManager {
  constructor(config) {
    this.repoUrl = config.repoUrl;
    this.branch = config.branch || 'main';
    this.userName = config.userName || 'Sovereign';
    this.userEmail = config.userEmail || 'noreply@sovereign.local';
    this.authToken = config.authToken || null;
    this.localPath = config.localPath || path.join(process.cwd(), 'data');
    this.git = null;
  }

  async initialize() {
    try {
      const exists = await this.checkIfRepoExists();
      if (!exists) {
        await this.cloneRepo();
      } else {
        await this.prepareExistingRepo();
        await this.pullLatest();
      }
      return true;
    } catch (error) {
      console.error('Failed to initialize repository:', error.message);
      throw error;
    }
  }

  async checkIfRepoExists() {
    try {
      await fs.access(path.join(this.localPath, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  async cloneRepo() {
    await fs.mkdir(this.localPath, { recursive: true });
    const authUrl = this.buildAuthUrl();

    // Clone
    await sg().clone(authUrl, this.localPath, [
      '--branch',
      this.branch,
      '--single-branch',
    ]);

    // Configure git
    this.git = sg(this.localPath);
    await this.git.addConfig('user.name', this.userName);
    await this.git.addConfig('user.email', this.userEmail);

    // Ensure remote is set with auth (if provided)
    await this.ensureRemoteConfigured();
  }

  async prepareExistingRepo() {
    this.git = sg(this.localPath);
    await this.git.addConfig('user.name', this.userName);
    await this.git.addConfig('user.email', this.userEmail);

    // If the existing repo points to a different remote, reclone
    const authUrl = this.buildAuthUrl();
    const expectedPath = new URL(this.repoUrl).pathname.replace(/\.git$/, '');
    const remotes = await this.git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');

    if (!origin || !origin.refs?.fetch) {
      // No origin, set it
      await this.git.addRemote('origin', authUrl);
    } else {
      const currentUrl = origin.refs.fetch;
      const currentPath = new URL(currentUrl).pathname.replace(/\.git$/, '');
      if (currentPath !== expectedPath) {
        // Different repo: wipe and fresh clone
        await fs.rm(this.localPath, { recursive: true, force: true });
        await this.cloneRepo();
        return;
      }
      // Same repo: ensure remote has auth
      await this.ensureRemoteConfigured();
    }
  }

  async ensureRemoteConfigured() {
    if (!this.git) {
      this.git = sg(this.localPath);
    }
    const authUrl = this.buildAuthUrl();
    // Keep remote named 'origin' but update to an authenticated URL if token provided
    if (this.authToken) {
      await this.git.remote(['set-url', 'origin', authUrl]);
    }
  }

  async pullLatest() {
    if (!this.git) {
      this.git = sg(this.localPath);
    }
    await this.git.addConfig('user.name', this.userName);
    await this.git.addConfig('user.email', this.userEmail);
    await this.ensureRemoteConfigured();
    await this.git.fetch('origin', this.branch);
    await this.git.pull('origin', this.branch);
  }

  async publish(commitMessage = 'Update from Sovereign') {
    if (!this.git) {
      this.git = sg(this.localPath);
    }
    await this.ensureRemoteConfigured();

    await this.git.add('.');
    const status = await this.git.status();
    if (status.files.length === 0) {
      return { success: true, message: 'No changes to publish' };
    }

    await this.git.commit(commitMessage);
    await this.git.push('origin', this.branch);
    return { success: true, message: 'Changes published successfully' };
  }

  buildAuthUrl() {
    if (!this.authToken) return this.repoUrl;
    const url = new URL(this.repoUrl);
    url.username = encodeURIComponent(this.authToken);
    return url.toString();
  }

  getLocalPath() {
    return this.localPath;
  }
}
