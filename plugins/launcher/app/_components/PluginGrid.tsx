import { PluginTile, type PluginTileData } from './PluginTile';
import styles from '../launcher.module.css';

/** Responsive grid of plugin tiles (LCH-01). */
export function PluginGrid({ plugins }: { plugins: PluginTileData[] }) {
  return (
    <ul className={styles.grid}>
      {plugins.map((plugin) => (
        <li key={plugin.id}>
          <PluginTile plugin={plugin} />
        </li>
      ))}
    </ul>
  );
}
