interface AppRuntimeShellProps {
  app: {
    id: string;
    name: string;
    runtime: string;
    version: string;
  };
  children: React.ReactNode;
}

export function AppRuntimeShell({
  app,
  children,
}: AppRuntimeShellProps) {
  return (
    <section>
      <header>
        <p>{app.id}</p>
        <h1>{app.name}</h1>
        <p>
          Runtime: {app.runtime} · Version: {app.version}
        </p>
      </header>

      <div>{children}</div>
    </section>
  );
}