// Offline fallback (PLT-09). next-pwa precaches this route and serves it for
// failed navigations, so an offline load shows the shell rather than a blank
// page. Kept self-contained — no auth, data, or platform chrome — so it
// renders from the cache with no network.
export const metadata = {
  title: 'Offline — Sovereign',
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--sv-space-3)',
        padding: 'var(--sv-space-8)',
        textAlign: 'center',
        color: 'var(--sv-color-text-primary)',
        background: 'var(--sv-color-surface)',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'var(--sv-font-size-xl)' }}>You’re offline</h1>
      <p style={{ margin: 0, color: 'var(--sv-color-text-muted)' }}>
        Sovereign can’t reach the server right now. Reconnect and try again.
      </p>
    </main>
  );
}
