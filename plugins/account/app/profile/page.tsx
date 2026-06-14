import { sdk } from '@sovereignfs/sdk';
import { updateDisplayNameAction } from '../actions';
import { AvatarUpload } from '../_components/AvatarUpload';
import styles from '../account.module.css';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { user } = await sdk.auth.requireSession();

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Avatar</h2>
        <AvatarUpload imageUrl={user.image} name={user.name ?? user.email} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Display name</h2>
        <form action={updateDisplayNameAction} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={100}
              defaultValue={user.name ?? ''}
              className={styles.input}
            />
          </div>
          <button type="submit" className={styles.button}>
            Save name
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Email</h2>
        <p className={styles.readonlyValue}>{user.email}</p>
        <p className={styles.help}>Email changes aren’t supported yet.</p>
      </section>
    </div>
  );
}
