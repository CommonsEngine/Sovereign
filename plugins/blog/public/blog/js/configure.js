/* eslint-disable no-undef */
(function () {
  const SM = window.StartupManager;
  if (!SM) {
    console.error("StartupManager not loaded");
    return;
  }

  const form = document.getElementById("blog-config-form");
  const errEl = document.getElementById("form-error");
  const saveBtn = document.getElementById("save-btn");

  function populateDefaults() {
    if (!form) return;
    const defaults = {
      repoUrl: form.dataset.repoUrl || "",
      branch: form.dataset.branch || "main",
      gitUserName: form.dataset.gitUserName || "",
      gitUserEmail: form.dataset.gitUserEmail || "",
      contentDir: form.dataset.contentDir || "",
    };

    const repo = document.getElementById("repo-url-input");
    const branch = document.getElementById("branch-input");
    const userName = document.getElementById("git-user-name-input");
    const userEmail = document.getElementById("git-user-email-input");
    const contentDir = document.getElementById("content-dir-input");

    if (repo && !repo.value) repo.value = defaults.repoUrl;
    if (branch && !branch.value) branch.value = defaults.branch;
    if (userName && !userName.value) userName.value = defaults.gitUserName;
    if (userEmail && !userEmail.value) userEmail.value = defaults.gitUserEmail;
    if (contentDir && !contentDir.value) contentDir.value = defaults.contentDir;
  }

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
      const branch = (document.getElementById("branch-input").value || "main").trim() || "main";
      const contentDir = document.getElementById("content-dir-input").value.trim();

      const gitUserName = document.getElementById("git-user-name-input").value.trim();
      const gitUserEmail = document.getElementById("git-user-email-input").value.trim();
      const gitAuthToken = document.getElementById("git-auth-token-input").value.trim();

      if (!repoUrl) {
        showError("Repository URL is required.");
        return;
      }

      const payload = { repoUrl, branch };
      if (contentDir) payload.contentDir = contentDir;
      if (gitUserName) payload.gitUserName = gitUserName;
      if (gitUserEmail) payload.gitUserEmail = gitUserEmail;
      if (gitAuthToken) payload.gitAuthToken = gitAuthToken;

      saveBtn.disabled = true;
      saveBtn.setAttribute("aria-busy", "true");

      async function postConfigWithRetry(attempt = 0) {
        try {
          const resp = await window.fetch(
            `/api/plugins/blog/${encodeURIComponent(projectId)}/configure`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          );
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data?.error || "Save failed");
          window.location.replace(`/blog/${encodeURIComponent(projectId)}`);
        } catch (ex) {
          if (ex instanceof TypeError && attempt === 0) {
            // transient network error, retry once
            await new Promise((resolve) => setTimeout(resolve, 500));
            return postConfigWithRetry(attempt + 1);
          }
          showError(ex?.message || "Failed to save configuration");
        } finally {
          saveBtn.disabled = false;
          saveBtn.removeAttribute("aria-busy");
        }
      }

      try {
        await postConfigWithRetry();
      } catch {
        // handled in postConfigWithRetry
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
    populateDefaults();
    try {
      await SM.runAll({ parallel: true });
    } catch (err) {
      console.error("Startup errors", SM.getState(), err);
    }
  });
})();
