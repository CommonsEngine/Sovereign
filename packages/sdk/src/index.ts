import * as auth from './auth';
import * as db from './db';
import * as mailer from './mailer';
import * as platform from './platform';
import { events, notifications, storage } from './unimplemented';

/**
 * The Sovereign SDK — the only contract between a plugin and the platform.
 *
 * `auth` and `mailer` are wired with real runtime implementations (Task 0.4.02).
 * `db` and `platform` remain as stubs until Task 0.5.05.
 * `storage`, `notifications`, and `events` are reserved for post-v1.
 */
export const sdk = {
  auth,
  db,
  mailer,
  platform,
  storage,
  notifications,
  events,
};

export { NotImplementedError, NotAuthenticatedError } from './errors';
export type { Session, SessionUser, MailOptions, PlatformConfig, DrizzleClient } from './types';
