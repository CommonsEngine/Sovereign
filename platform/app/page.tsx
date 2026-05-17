import { installedApps } from "../generated/apps.generated";

export default function HomePage() {
  return (
    <main>
      <h1>Sovereign</h1>
      <p>Personal platform runtime</p>

      <section>
        <h2>Installed Apps</h2>

        {installedApps.length === 0 ? (
          <p>No apps installed.</p>
        ) : (
          <ul>
            {installedApps.map((app) => (
              <li key={app.id}>
                <strong>{app.name}</strong>
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