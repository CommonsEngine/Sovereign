(() => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const SW_URL = "/sw.js";

  const registerServiceWorker = () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
      .catch((error) => {
        console.error("[Sovereign] Failed to register service worker", error);
      });
  };

  window.addEventListener("load", registerServiceWorker);
})();

(() => {
  let deferredPrompt = null;

  const emit = (type, detail) => {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  };

  window.SovereignPWA = {
    canPromptInstall: () => Boolean(deferredPrompt),
    async promptInstall() {
      if (!deferredPrompt) {
        throw new Error("Install prompt not available yet.");
      }
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      const result = await promptEvent.userChoice;
      emit("sovereign:pwa:prompt-result", result);
      return result;
    },
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit("sovereign:pwa:installable", {});
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit("sovereign:pwa:installed", {});
  });
})();
