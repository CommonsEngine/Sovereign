import { createMailer } from '@sovereignfs/mailer';
import type { MailOptions } from './types';

// Singleton mailer — reads SMTP_* from process.env at first call.
const _mailer = createMailer();

/** Sends an email via the platform mailer. No-ops when SMTP is not configured. */
export async function send(options: MailOptions): Promise<void> {
  await _mailer.send(options);
}
