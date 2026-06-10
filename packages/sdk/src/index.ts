import * as auth from './auth';
import * as db from './db';
import * as mailer from './mailer';
import * as platform from './platform';
import { events, notifications, storage } from './unimplemented';

/**
 * The Sovereign SDK — the only contract between a plugin and the platform.
 *
 * In v1 these are interface stubs: the runtime supplies the real auth / db /
 * mailer / platform implementations at call time. `storage`, `notifications`,
 * and `events` are reserved for post-v1 and throw `NotImplementedError`.
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

export { NotImplementedError } from './errors';
export type { Session, SessionUser, MailOptions, PlatformConfig, DrizzleClient } from './types';
