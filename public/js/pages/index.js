// Uses global StartupManager for index page specific startup tasks
(function () {
  const SM = window.StartupManager;
  if (!SM) {
    console.error("StartupManager not loaded");
    return;
  }

  async function fetchProjects() {
    // TODO: Implement pagination / lazy loading
    const resp = await fetch("/api/projects");
    if (!resp.ok) throw new Error("Failed to fetch projects");
    return resp.json();
  }

  SM.register("projects", async () => {
    const data = await fetchProjects();
    const projects = data?.projects || data?.items || data || [];
    const container = document.querySelector("#grid");
    if (!container) return data;

    for (const p of projects) {
      if (!p || !p.id) continue;
      // skip if card already present
      if (
        document.querySelector(
          `.projects__card[data-project-id="${CSS.escape(p.id)}"]`,
        )
      )
        continue;

      const article = document.createElement("article");
      article.className = "projects__card";
      article.setAttribute("data-project-id", p.id);
      article.setAttribute("data-owned", p.owned ? "true" : "false");

      // Row: title + status
      const row = document.createElement("div");
      row.className = "projects__card-row";

      const titleDiv = document.createElement("div");
      titleDiv.className = "projects__card-title";
      if (p.owned) {
        titleDiv.setAttribute("data-inline-edit", "name");
        titleDiv.setAttribute("title", "Double-click to rename");
        titleDiv.setAttribute("tabindex", "0");
      }
      titleDiv.textContent = p.name || "Untitled";

      const badge = document.createElement("span");
      badge.className = "projects__card-badge projects__card-badge--status";
      badge.textContent = p.status || "";

      row.appendChild(titleDiv);
      row.appendChild(badge);
      article.appendChild(row);

      // Meta: scope / type chips
      const metaInfo = document.createElement("div");
      metaInfo.className = "projects__card-meta projects__card-meta--info";
      if (p.scope) {
        const chip = document.createElement("span");
        chip.className = "projects__card-chip projects__card-chip--scope";
        chip.title = "Scope";
        chip.textContent = p.scope;
        metaInfo.appendChild(chip);
      }
      if (p.type) {
        const chip = document.createElement("span");
        chip.className = "projects__card-chip projects__card-chip--type";
        chip.title = "Type";
        chip.textContent = p.type;
        metaInfo.appendChild(chip);
      }
      article.appendChild(metaInfo);

      // Date
      const metaDate = document.createElement("div");
      metaDate.className = "projects__card-meta projects__card-meta--date";
      const timeEl = document.createElement("time");
      timeEl.className = "created-at";
      if (p.createdAt) {
        timeEl.dataset.date = p.createdAt;
        const d = new Date(p.createdAt);
        if (!Number.isNaN(d.getTime())) timeEl.textContent = d.toLocaleString();
      }
      metaDate.appendChild(timeEl);
      article.appendChild(metaDate);

      // Actions (Open + optional Delete)
      const actions = document.createElement("div");
      actions.className = "projects__card-actions";

      const openLink = document.createElement("a");
      openLink.className = "projects__card-link";
      openLink.href = p.url || `/p/${encodeURIComponent(p.id)}`;
      openLink.textContent = "Open";
      actions.appendChild(openLink);

      if (p.owned) {
        const delBtn = document.createElement("button");
        delBtn.className = "projects__card-delete";
        delBtn.type = "button";
        delBtn.title = "Delete project";
        delBtn.setAttribute("aria-label", "Delete project");
        delBtn.setAttribute("data-action", "delete");
        delBtn.setAttribute("data-id", p.id);
        // reuse svg icon (static string)
        delBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                </svg>
              `;
        actions.appendChild(delBtn);
      }

      article.appendChild(actions);

      // insert at end (keeps the "create new" card at the top if present)
      container.insertAdjacentElement("beforeend", article);
    }

    return data;
  });

  SM.register("notifications", async () => {
    // placeholder, optional
    return {};
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
