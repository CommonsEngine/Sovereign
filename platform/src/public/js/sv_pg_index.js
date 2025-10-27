/* eslint-disable no-undef */
// Uses global StartupManager for index page specific startup tasks
(function () {
  const SM = window.StartupManager;
  if (!SM) {
    console.error("StartupManager not loaded");
    return;
  }

  async function fetchProjects() {
    const resp = await window.fetch("/api/projects");
    if (!resp.ok) throw new Error("Failed to fetch projects");
    return resp.json();
  }

  SM.register("projects", async () => {
    const data = await fetchProjects();
    const projects = data?.projects || [];
    const container = document.querySelector("#grid");
    if (!container) return data;

    for (const p of projects) {
      if (!p || !p.id) continue;
      if (document.querySelector(`.sv-projects__card[data-project-id="${CSS.escape(p.id)}"]`))
        continue;

      const article = document.createElement("article");
      article.className = "sv-projects__card";
      article.setAttribute("data-project-id", p.id);
      article.setAttribute("data-owned", p.owned ? "true" : "false");
      article.setAttribute("data-shared", p.shared ? "true" : "false");

      const row = document.createElement("div");
      row.className = "sv-projects__card-row";

      const titleDiv = document.createElement("div");
      titleDiv.className = "sv-projects__card-title";
      if (p.owned) {
        titleDiv.setAttribute("data-inline-edit", "name");
        titleDiv.setAttribute("title", "Double-click to rename");
        titleDiv.setAttribute("tabindex", "0");
      }
      titleDiv.textContent = p.name || "Untitled";

      const badge = document.createElement("span");
      badge.className = "sv-projects__card-badge sv-projects__card-badge--status";
      badge.textContent = p.status || "";

      row.appendChild(titleDiv);
      row.appendChild(badge);
      article.appendChild(row);

      const metaInfo = document.createElement("div");
      metaInfo.className = "sv-projects__card-meta sv-projects__card-meta--info";
      if (p.scope) {
        const chip = document.createElement("span");
        chip.className = "sv-projects__card-chip sv-projects__card-chip--scope";
        chip.title = "Scope";
        chip.textContent = p.scope;
        metaInfo.appendChild(chip);
      }
      if (p.type) {
        const chip = document.createElement("span");
        chip.className = "sv-projects__card-chip sv-projects__card-chip--type";
        chip.title = "Type";
        chip.textContent = p.type;
        metaInfo.appendChild(chip);
      }
      if (p.shared) {
        const chip = document.createElement("span");
        chip.className = "sv-projects__card-chip sv-projects__card-chip--shared";
        chip.title = p.owned ? "Shared with teammates" : "Shared project";
        chip.textContent = p.owned ? "Shared" : "Shared with you";
        metaInfo.appendChild(chip);
      }
      article.appendChild(metaInfo);

      const metaDate = document.createElement("div");
      metaDate.className = "sv-projects__card-meta sv-projects__card-meta--date";
      const timeEl = document.createElement("time");
      timeEl.className = "created-at";
      if (p.createdAt) {
        timeEl.dataset.date = p.createdAt;
        const d = new Date(p.createdAt);
        if (!Number.isNaN(d.getTime())) timeEl.textContent = d.toLocaleString();
      }
      metaDate.appendChild(timeEl);
      article.appendChild(metaDate);

      const actions = document.createElement("div");
      actions.className = "sv-projects__card-actions";

      const openLink = document.createElement("a");
      openLink.className = "sv-projects__card-link";
      openLink.href = p.url || `/p/${encodeURIComponent(p.id)}`;
      openLink.textContent = "Open";
      actions.appendChild(openLink);

      if (p.owned) {
        const delBtn = document.createElement("button");
        delBtn.className = "sv-projects__card-delete";
        delBtn.type = "button";
        delBtn.title = "Delete project";
        delBtn.setAttribute("aria-label", "Delete project");
        delBtn.setAttribute("data-action", "delete");
        delBtn.setAttribute("data-id", p.id);
        delBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
          </svg>`;
        actions.appendChild(delBtn);
      }

      article.appendChild(actions);
      container.insertAdjacentElement("beforeend", article);
    }

    return data;
  });

  SM.register("notifications", async () => ({}));

  // -------------------------
  // Inline-edit / delete logic moved here
  // -------------------------
  function findCardById(id) {
    return document.querySelector(`.sv-projects__card[data-project-id="${CSS.escape(id)}"]`);
  }

  async function deleteProject(id) {
    const card = findCardById(id);
    if (!card) return;
    if (!confirm("This will permanently delete the project. Continue?")) return;
    try {
      const resp = await window.fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Delete failed");
      card.remove();
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  }

  // start inline edit on a title element
  function startTitleEdit(titleEl) {
    const card = titleEl.closest(".sv-projects__card");
    if (!card || card.dataset.owned !== "true") return;
    if (card.dataset.editing === "name") return;

    const id = card.getAttribute("data-project-id");
    const prev = titleEl.textContent.trim();
    card.dataset.editing = "name";

    titleEl.contentEditable = "true";
    titleEl.setAttribute("role", "textbox");
    titleEl.setAttribute("aria-label", "Edit project name");
    titleEl.setAttribute("aria-multiline", "false");
    titleEl.classList.add("is-editing");

    titleEl.focus();
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const cleanup = () => {
      titleEl.contentEditable = "false";
      titleEl.removeAttribute("role");
      titleEl.removeAttribute("aria-label");
      titleEl.removeAttribute("aria-multiline");
      titleEl.classList.remove("is-editing");
      delete card.dataset.editing;
      titleEl.removeEventListener("keydown", onKeydown);
      titleEl.removeEventListener("blur", onBlur);
      titleEl.removeEventListener("paste", onPaste);
    };

    const cancel = () => {
      titleEl.textContent = prev;
      cleanup();
    };

    const save = async () => {
      const next = titleEl.textContent.trim().slice(0, 120) || prev;
      if (next === prev) return cancel();
      try {
        titleEl.setAttribute("aria-busy", "true");
        const resp = await window.fetch(`/api/projects/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: next }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || "Rename failed");
        titleEl.textContent = data?.name || next;
      } catch (err) {
        alert(err.message || "Rename failed");
        titleEl.textContent = prev;
      } finally {
        titleEl.removeAttribute("aria-busy");
        cleanup();
      }
    };

    const onKeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };

    const onBlur = () => save();

    const onPaste = (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData)
        .getData("text")
        .replace(/\s+/g, " ")
        .slice(0, 120);
      document.execCommand("insertText", false, text);
    };

    titleEl.addEventListener("keydown", onKeydown);
    titleEl.addEventListener("blur", onBlur);
    titleEl.addEventListener("paste", onPaste);
  }

  // wire UI behaviour and loader
  function wireLoader() {
    const spinner = document.querySelector("[data-startup-spinner]");
    SM.onChange((state) => {
      if (!spinner) return;
      spinner.style.display = state.isLoading ? "block" : "none";
    });
  }

  // global delegated handlers
  function wireDelegates() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-action="delete"]');
      if (btn) {
        const id = btn.getAttribute("data-id");
        if (id) deleteProject(id);
      }
    });

    document.addEventListener("dblclick", (e) => {
      const title = e.target.closest('[data-inline-edit="name"]');
      if (title) startTitleEdit(title);
    });

    document.addEventListener("keydown", (e) => {
      // start edit on Enter when a focus is on editable title
      const title = document.activeElement?.closest
        ? document.activeElement.closest('[data-inline-edit="name"]')
        : null;
      if (!title) return;
      if (e.key === "Enter") {
        e.preventDefault();
        startTitleEdit(title);
      }
    });
  }

  // format existing date elements
  function formatDates() {
    document.querySelectorAll(".created-at").forEach((el) => {
      const d = new Date(el.dataset.date);
      if (!Number.isNaN(d.getTime())) el.textContent = d.toLocaleString();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    wireLoader();
    wireDelegates();
    formatDates();
    try {
      await SM.runAll({ parallel: true });
    } catch (e) {
      console.error("Startup errors", SM.getState(), e);
    }
  });
})();
