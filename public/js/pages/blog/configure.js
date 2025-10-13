(function () {
  const SM = window.StartupManager;
  if (!SM) {
    console.error("StartupManager not loaded");
    return;
  }

  const form = document.getElementById("blog-config-form");
  const errEl = document.getElementById("form-error");
  const saveBtn = document.getElementById("save-btn");

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || "Failed to save configuration";
    errEl.style.display = "block";
  }
  function clearError() {
    if (!errEl) return;
    errEl.textContent = "";
    errEl.style.display = "none";
  }

  // register an init task for StartupManager so page-level loader/sync works consistently
  SM.register("blog-config", async () => {
    if (!form) return { attached: false };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();

      const projectId = form.getAttribute("data-project-id");
      const repoUrl = document.getElementById("repo-url-input").value.trim();
      const defaultBranch =
        (document.getElementById("branch-input").value || "main").trim() ||
        "main";
      const contentDir = document
        .getElementById("content-dir-input")
        .value.trim();

      const gitUserName = document
        .getElementById("git-user-name-input")
        .value.trim();
      const gitUserEmail = document
        .getElementById("git-user-email-input")
        .value.trim();
      const gitAuthToken = document
        .getElementById("git-auth-token-input")
        .value.trim();

      if (!repoUrl) {
        showError("Repository URL is required.");
        return;
      }

      const payload = { repoUrl, defaultBranch };
      if (contentDir) payload.contentDir = contentDir;
      if (gitUserName) payload.gitUserName = gitUserName;
      if (gitUserEmail) payload.gitUserEmail = gitUserEmail;
      if (gitAuthToken) payload.gitAuthToken = gitAuthToken;

      saveBtn.disabled = true;
      saveBtn.setAttribute("aria-busy", "true");

      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/configure`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || "Save failed");
        window.location.replace(`/p/${encodeURIComponent(projectId)}`);
      } catch (ex) {
        showError(ex?.message || "Failed to save configuration");
      } finally {
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-busy");
      }
    });

    return { attached: true };
  });

  function wireLoader() {
    const spinner = document.querySelector("[data-startup-spinner]");
    SM.onChange((state) => {
      if (!spinner) return;
      spinner.style.display = state.isLoading ? "block" : "none";
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    wireLoader();
    try {
      await SM.runAll({ parallel: true });
    } catch (e) {
      console.error("Startup errors", SM.getState());
    }
  });
})();
