import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './account.module.css';

// Tabs for the Account plugin. Security (password + sessions) arrives in the
// next part of Task 0.4.06.
const tabs = [
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/preferences', label: 'Preferences' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.account}>
      <header className={styles.header}>
        <h1 className={styles.title}>Account</h1>
        <nav className={styles.tabs} aria-label="Account sections">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className={styles.tab}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
