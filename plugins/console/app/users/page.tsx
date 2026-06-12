import Link from 'next/link';
import { changeRoleAction, toggleActiveAction } from './actions';
import styles from '../console.module.css';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  createdAt: number;
}

async function getUsers(): Promise<AdminUser[]> {
  const authUrl = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${authUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return res.json() as Promise<AdminUser[]>;
}

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Users</h2>
        <Link href="/console/users/invite" className={styles.actionButton}>
          Invite user
        </Link>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Name / Email</th>
              <th className={styles.th}>Role</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Joined</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.userCell}>
                    <span className={styles.userName}>{user.name ?? '—'}</span>
                    <span className={styles.userEmail}>{user.email}</span>
                  </div>
                </td>
                <td className={styles.td}>
                  <span
                    className={
                      user.role === 'platform:admin' ? styles.badgeAdmin : styles.badgeUser
                    }
                  >
                    {user.role === 'platform:admin' ? 'Admin' : 'User'}
                  </span>
                </td>
                <td className={styles.td}>
                  <span className={user.active ? styles.badgeActive : styles.badgeDeactivated}>
                    {user.active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className={styles.td}>
                  <time dateTime={new Date(user.createdAt * 1000).toISOString()}>
                    {new Date(user.createdAt * 1000).toLocaleDateString()}
                  </time>
                </td>
                <td className={styles.td}>
                  <div className={styles.rowActions}>
                    <form action={changeRoleAction} className={styles.roleForm}>
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="role"
                        defaultValue={user.role}
                        className={styles.roleSelect}
                        aria-label={`Role for ${user.email}`}
                      >
                        <option value="platform:user">User</option>
                        <option value="platform:admin">Admin</option>
                      </select>
                      <button type="submit" className={styles.actionButtonSmall}>
                        Save
                      </button>
                    </form>

                    <form action={toggleActiveAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="active" value={user.active ? 'false' : 'true'} />
                      <button
                        type="submit"
                        className={user.active ? styles.deactivateButton : styles.reactivateButton}
                      >
                        {user.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
