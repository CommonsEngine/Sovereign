import { sdk } from '@sovereignfs/sdk';
import { PasswordChangeForm } from '../_components/PasswordChangeForm';
import { SessionList } from '../_components/SessionList';
import styles from '../account.module.css';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await sdk.auth.requireSession();
  const sessions = await sdk.auth.listSessions();

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Change password</h2>
        <PasswordChangeForm />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active sessions</h2>
        <SessionList sessions={sessions} />
      </section>
    </div>
  );
}
