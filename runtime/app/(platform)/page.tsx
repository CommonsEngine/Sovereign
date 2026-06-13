import { redirect } from 'next/navigation';
import { DEFAULT_ROOT_PLUGIN_ID, getPlatformSetting } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import styles from './page.module.css';

// `/` resolves to the configured root plugin's routePrefix (SRS PLT-14).
// Force dynamic so a root-plugin change in Console takes effect immediately.
export const dynamic = 'force-dynamic';

export default function Home() {
  const rootPluginId =
    getPlatformSetting(getPlatformDb(), 'root_plugin_id') ?? DEFAULT_ROOT_PLUGIN_ID;
  const rootPlugin = getInstalledPlugins().find((plugin) => plugin.id === rootPluginId);

  if (rootPlugin) {
    redirect(rootPlugin.routePrefix);
  }

  // Fallback while the configured root plugin (the Launcher by default) is
  // not yet installed — Task 0.4.05 ships it.
  return (
    <div className={styles.home}>
      <h1 className={styles.title}>Welcome to Sovereign</h1>
      <p className={styles.text}>
        The configured root plugin is not installed. Installed plugins will appear in the sidebar.
      </p>
    </div>
  );
}
