import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getInstalledPlugins } from '@/src/registry';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import styles from './shell.module.css';

function monogram(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const role = (await headers()).get('x-sovereign-user-role') ?? 'platform:user';
  const isAdmin = role === 'platform:admin';
  // Middle section: one icon per non-chrome plugin. Chrome plugins (Launcher,
  // Console, Account) are reached via the home `/`, ⚙, and avatar links below
  // (SRS PLT-12). Full root-plugin-first ordering lands with the shell
  // three-section work (PLT-11–15).
  const plugins = getInstalledPlugins().filter((plugin) => !CHROME_PLUGIN_IDS.has(plugin.id));

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
