import type { sovereign } from "../../../packages/sdk/src";

interface LauncherAppProps {
  sdk: typeof sovereign;
}

export default function LauncherApp({ sdk }: LauncherAppProps) {
  const user = sdk.auth.currentUser();

  return (
    <section>
      <h2>Launcher App</h2>
      <p>Signed in as {user.displayName}</p>
    </section>
  );
}
