import styles from './page.module.css';

// Placeholder root. Task 0.4.04 (Console settings) makes `/` redirect to the
// configured root plugin's routePrefix (PLT-14).
export default function Home() {
  return (
    <div className={styles.home}>
      <h1 className={styles.title}>Welcome to Sovereign</h1>
      <p className={styles.text}>
        No plugins are installed yet. Installed plugins will appear in the sidebar.
      </p>
    </div>
  );
}
