/* eslint-disable no-undef */
/* eslint-disable n/no-unsupported-features/node-builtins */

(function () {
  if (!("serviceWorker" in navigator)) return;

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
