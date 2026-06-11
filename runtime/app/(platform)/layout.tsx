import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getInstalledPlugins } from '@/src/registry';
import styles from './shell.module.css';

function monogram(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const role = (await headers()).get('x-sovereign-user-role') ?? 'platform:user';
  const isAdmin = role === 'platform:admin';
  const plugins = getInstalledPlugins();

  const pluginIcons = plugins.map((plugin) => (
    <Link key={plugin.id} href={plugin.routePrefix} className={styles.icon} title={plugin.name}>
      {monogram(plugin.name)}
    </Link>
  ));

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Primary navigation">
        <Link href="/" className={styles.brand} aria-label="Sovereign home">
          S
        </Link>
        <nav className={styles.plugins} aria-label="Plugins">
          {pluginIcons}
        </nav>
        <div className={styles.chrome}>
          {isAdmin ? (
            <Link href="/console" className={styles.icon} title="Console" aria-label="Console">
              ⚙
            </Link>
          ) : null}
          <Link href="/account" className={styles.avatar} title="Account" aria-label="Account" />
        </div>
      </aside>

      <header className={styles.mobileHeader}>
        <Link href="/" className={styles.mobileBrand} aria-label="Sovereign home">
          Sovereign
        </Link>
        <Link href="/account" className={styles.avatar} aria-label="Account" />
      </header>

      <main className={styles.content}>{children}</main>

      <nav className={styles.mobileFooter} aria-label="Plugins">
        {pluginIcons}
        {isAdmin ? (
          <Link href="/console" className={styles.icon} aria-label="Console">
            ⚙
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
