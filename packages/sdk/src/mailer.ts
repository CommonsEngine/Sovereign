import { NotImplementedError } from './errors';
import type { MailOptions } from './types';

/** Sends an email via the platform mailer. */
export function send(_options: MailOptions): Promise<void> {
  throw new NotImplementedError(
    'sdk.mailer.send() is provided by the Sovereign runtime and has no standalone implementation.',
  );
}
