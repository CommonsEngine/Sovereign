import * as auth from './auth';
import { data } from './data';
import * as db from './db';
import * as mailer from './mailer';
import * as platform from './platform';
import { events, notifications, storage } from './unimplemented';

/**
 * The Sovereign SDK — the only contract between a plugin and the platform.
 *
 * `auth` and `mailer` are wired with real runtime implementations (Task 0.4.02).
 * `db` and `platform` remain as stubs until Task 0.5.05.
 * `data` (cross-plugin data sharing, RFC 0002), `storage`, `notifications`, and
 * `events` are reserved — declared but not yet implemented.
 */
export const sdk = {
  auth,
  data,
  db,
  mailer,
  platform,
  storage,
  notifications,
  events,
};

export { NotImplementedError, NotAuthenticatedError, ConsentRequiredError } from './errors';
export type { DataContractRef, DataContractResolver } from './data';
export type {
  Session,
  SessionUser,
  ActiveSession,
  ChangePasswordInput,
  MailOptions,
  PlatformConfig,
  DrizzleClient,
} from './types';
