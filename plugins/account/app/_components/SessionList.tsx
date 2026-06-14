import type { ActiveSession } from '@sovereignfs/sdk';
import { revokeSessionAction } from '../actions';
import styles from '../account.module.css';

/** A coarse "browser on OS" hint from a User-Agent string (ACC-05). */
function deviceHint(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

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
