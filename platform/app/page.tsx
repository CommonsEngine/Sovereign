import { getInstalledApps } from "../src/launcher";

export default function HomePage() {
  const apps = getInstalledApps();

  return (
    <main>
      <h1>Sovereign</h1>
      <p>Personal platform runtime</p>

      <section>
        <h2>Installed Apps</h2>

        {apps.length === 0 ? (
          <p>No apps installed.</p>
        ) : (
          <ul>
            {apps.map((app) => (
              <li key={app.id}>
                <a href={`/apps/${app.id}`}>
                  <strong>{app.name}</strong>
                </a>
                <br />
                <span>{app.id}</span>
                <br />
                <span>Runtime: {app.runtime}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
