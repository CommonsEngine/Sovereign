import type { ActiveSession } from '@sovereignfs/sdk';
import { revokeSessionAction } from '../actions';
import { deviceHint } from '../_lib/device-hint';
import styles from '../account.module.css';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function SessionList({ sessions }: { sessions: ActiveSession[] }) {
  if (sessions.length === 0) {
    return <p className={styles.help}>No active sessions.</p>;
  }

  return (
    <ul className={styles.sessionList}>
      {sessions.map((session) => (
        <li key={session.token} className={styles.sessionRow}>
          <div className={styles.sessionInfo}>
            <span className={styles.sessionDevice}>
              {deviceHint(session.userAgent)}
              {session.current && <span className={styles.currentBadge}>This session</span>}
            </span>
            <span className={styles.sessionMeta}>
              {session.ipAddress ?? 'unknown IP'} · last active {formatDate(session.updatedAt)}
            </span>
          </div>
          {session.current ? (
            <span className={styles.help}>Current</span>
          ) : (
            <form action={revokeSessionAction}>
              <input type="hidden" name="token" value={session.token} />
              <input type="hidden" name="current" value="false" />
              <button type="submit" className={styles.revokeButton}>
                Revoke
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
