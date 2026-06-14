import Link from 'next/link';
import styles from '../launcher.module.css';

export interface PluginTileData {
  id: string;
  name: string;
  description: string;
  routePrefix: string;
}

/** Two-letter monogram fallback (no icon-serving pipeline yet — see launcher.md Q3). */
function monogram(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('');
  return (initials.slice(0, 2) || name.slice(0, 2)).toUpperCase();
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
