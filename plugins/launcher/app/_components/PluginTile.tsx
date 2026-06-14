import Link from 'next/link';
import { monogram } from './monogram';
import styles from '../launcher.module.css';

export interface PluginTileData {
  id: string;
  name: string;
  description: string;
  routePrefix: string;
}

/** A single plugin tile (LCH-01/02): icon, name, description; links to the plugin. */
export function PluginTile({ plugin }: { plugin: PluginTileData }) {
  return (
    <Link href={plugin.routePrefix} className={styles.tile}>
      <span className={styles.tileIcon} aria-hidden="true">
        {monogram(plugin.name)}
      </span>
      <span className={styles.tileName}>{plugin.name}</span>
      {plugin.description && <span className={styles.tileDesc}>{plugin.description}</span>}
    </Link>
  );
}
