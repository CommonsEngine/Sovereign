/* eslint-disable no-undef */
/* eslint-disable n/no-unsupported-features/node-builtins */

(function () {
  if (!("serviceWorker" in navigator)) return;

  // Treat localhost-style hosts as development environments where we do NOT want a PWA SW.
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";

  if (isLocalhost) {
    // In dev, proactively unregister any existing service workers so they don't interfere.
    navigator.serviceWorker
      .getRegistrations()
      // eslint-disable-next-line promise/always-return
      .then((regs) => {
        regs.forEach((reg) => {
          console.info("[PWA] Unregistering service worker in dev", reg.scope);
          reg.unregister();
        });
      })
      .catch((err) => {
        console.warn("[PWA] Failed to clean up service workers in dev", err);
      });
    return;
  }

  const swUrl = "/sw.js";

  async function register() {
    try {
      const reg = await navigator.serviceWorker.register(swUrl, { scope: "/" });
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            console.info("[PWA] A new version is ready. It will take effect on next load.");
          }
        });
      });
      console.info("[PWA] Service worker registered", reg.scope);
    } catch (err) {
      console.warn("[PWA] Service worker registration failed", err);
    }
  }

  // Delay until the page is fully loaded to avoid competing with critical requests
  window.addEventListener("load", register, { once: true });
})();
