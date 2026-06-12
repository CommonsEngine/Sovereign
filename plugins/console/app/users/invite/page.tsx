import { InviteForm } from './invite-form';
import styles from '../../console.module.css';

export default function InvitePage() {
  return (
    <div>
      <h2 className={styles.pageTitle}>Invite user</h2>
      <p className={styles.lede}>
        Send an invitation email. The recipient must register using the invited email address.
      </p>
      <InviteForm />
    </div>
  );
}
