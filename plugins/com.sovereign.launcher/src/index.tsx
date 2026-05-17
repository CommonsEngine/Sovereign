import type { SovereignAppProps } from "../../../packages/sdk/src";

export default function LauncherApp({ sdk }: SovereignAppProps) {
  const user = sdk.auth.currentUser();

  return (
    <section>
      <h2>Launcher App</h2>
      <p>Signed in as {user.displayName}</p>
    </section>
  );
}
