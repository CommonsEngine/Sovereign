// New file — page logic moved from inline script and registered as a startup task
(function () {
  const SM = window.StartupManager;
  if (!SM) {
    console.error("StartupManager not loaded");
    return;
  }

  function resolveProjectId() {
    // prefer explicit data attribute
    const main = document.querySelector("main[data-project-id]");
    if (main?.dataset?.projectId) return main.dataset.projectId;
    // fallback: from "New Post" link
    const a = document.getElementById("new-post-btn");
    if (a?.href) {
      const m = a.href.match(/\/p\/([^/]+)/);
      if (m) return m[1];
    }
    // fallback: location
    const m2 = location.pathname.match(/\/p\/([^/]+)/);
    if (m2) return m2[1];
    return null;
  }

  const search = document.getElementById("post-search");
  const tbody = document.getElementById("posts-tbody");
  const table = document.getElementById("posts-table");
  const emptyRow = tbody?.querySelector(".empty-row");
  const loadingRow = tbody?.querySelector(".loading-row");
  const errorRow = tbody?.querySelector(".error-row");
  const retryConnectionBtn = document.querySelector(
    '[data-action="retry-connection"]',
  );

  let rows = [];

  function applySearch() {
    const q = (search?.value || "").trim().toLowerCase();
    let shown = 0;
    rows.forEach((tr) => {
      const hay =
        `${tr.dataset.title} ${tr.dataset.path} ${tr.dataset.tags || ""} ${tr.dataset.excerpt || ""} ${tr.dataset.status || ""}`.toLowerCase();
      const match = !q || hay.includes(q);
      tr.hidden = !match;
      if (match) shown++;
    });
    if (emptyRow) emptyRow.hidden = shown !== 0;
  }

  function fmtDate(d) {
    if (!d) return { iso: "", label: "—" };
    try {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return { iso: "", label: "—" };
      return { iso: dt.toISOString(), label: dt.toLocaleString() };
    } catch {
      return { iso: "", label: "—" };
    }
  }

  function makePostRow(projectId, post) {
    const title =
      (post.title && post.title.trim()) ||
      (post.filename || "").replace(/\.md$/i, "");
    const description =
      (typeof post.description === "string" && post.description) || "";
    const tagsText = Array.isArray(post.tags)
      ? post.tags.join(", ")
      : post.tags || "";
    const statusLabel = post.status || (post.draft ? "Draft" : "Published");
    const hrefEdit = `/p/${projectId}/blog/post/${encodeURIComponent(post.filename)}?edit=true`;
    const publishSource = post.pubDate || post.modified;
    const { iso, label } = publishSource
      ? fmtDate(publishSource)
      : { iso: "", label: "—" };
    const excerpt =
      typeof post.excerpt === "string" ? post.excerpt : description;

    const tr = document.createElement("tr");
    tr.dataset.title = title;
    tr.dataset.path = post.filename || "";
    tr.dataset.tags = tagsText;
    tr.dataset.excerpt = excerpt || "";
    tr.dataset.status = statusLabel;

    tr.innerHTML = `
      <td>
        <div class="title">${escapeHtml(title)}</div>
        <div class="subtle">${escapeHtml(description)}</div>
      </td>
      <td>${escapeHtml(post.filename || "")}</td>
      <td>${escapeHtml(tagsText)}</td>
      <td><span class="badge">${escapeHtml(statusLabel)}</span></td>
      <td>${iso ? `<time datetime="${iso}">${escapeHtml(label)}</time>` : "—"}</td>
      <td>
        <div class="row-actions">
          <a class="chip" href="${hrefEdit}">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              stroke-width="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
          </a>
          <button class="chip chip--danger" type="button" data-action="delete" data-id="${escapeAttr(post.filename)}">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              stroke-width="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </button>
        </div>
      </td>
    `;
    return tr;
  }

  function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function escapeAttr(s) {
    return encodeURIComponent(String(s || ""));
  }

  function clearDataRows() {
    Array.from(
      tbody.querySelectorAll(
        "tr:not(.empty-row):not(.loading-row):not(.error-row)",
      ),
    ).forEach((n) => n.remove());
    rows = [];
  }

  function setLoading(isLoading) {
    if (table) table.setAttribute("aria-busy", isLoading ? "true" : "false");
    if (search) search.disabled = !!isLoading;
    if (loadingRow) loadingRow.hidden = !isLoading;
    if (errorRow) errorRow.hidden = true;
    if (emptyRow) emptyRow.hidden = true;
    if (isLoading) {
      clearDataRows();
      const countEl = document.getElementById("m-count");
      if (countEl) countEl.textContent = "—";
    }
  }

  async function fetchPosts(projectId) {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/blog/post/all`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return Array.isArray(data.posts) ? data.posts : [];
  }

  // register startup task (so global loader shows)
  SM.register("posts", async () => {
    const projectId = resolveProjectId();
    if (!projectId) {
      console.warn("Project id not found in URL");
      return { posts: [] };
    }

    setLoading(true);
    try {
      const posts = await fetchPosts(projectId);
      const frag = document.createDocumentFragment();
      posts.forEach((p) => frag.appendChild(makePostRow(projectId, p)));
      tbody.appendChild(frag);

      rows = Array.from(
        tbody.querySelectorAll(
          "tr:not(.empty-row):not(.loading-row):not(.error-row)",
        ),
      );
      if (emptyRow) emptyRow.hidden = rows.length !== 0;
      const countEl = document.getElementById("m-count");
      if (countEl) countEl.textContent = String(posts.length);

      setLoading(false);
      applySearch();
      return { posts };
    } catch (err) {
      console.error("Error loading posts:", err);
      setLoading(false);
      if (errorRow) errorRow.hidden = false;
      if (emptyRow) emptyRow.hidden = true;
      throw err;
    }
  });

  // UI behaviors not part of startup task (delegated handlers)
  function setRowBusy(tr, busy, btn) {
    if (!tr) return;
    tr.setAttribute("aria-busy", busy ? "true" : "false");
    tr.querySelectorAll("button").forEach((b) => (b.disabled = !!busy));
    tr.querySelectorAll("a").forEach((a) => {
      if (busy) {
        a.setAttribute("aria-disabled", "true");
        a.style.pointerEvents = "none";
        a.style.opacity = "0.6";
      } else {
        a.removeAttribute("aria-disabled");
        a.style.pointerEvents = "";
        a.style.opacity = "";
      }
    });
    if (btn) {
      if (busy) {
        btn.dataset.prevText = btn.textContent;
        btn.textContent = "Deleting…";
      } else if (btn.dataset.prevText) {
        btn.textContent = btn.dataset.prevText;
        delete btn.dataset.prevText;
      }
    }
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest('button[data-action="delete"]');
    if (!btn) return;

    const filename = btn.getAttribute("data-id");
    if (!filename) return;

    const projectId = resolveProjectId();
    if (!projectId) {
      alert("Project id not found.");
      return;
    }

    if (!confirm(`Delete post "${decodeURIComponent(filename)}"?`)) return;

    const tr = btn.closest("tr");
    setRowBusy(tr, true, btn);

    try {
      const resp = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/blog/post/${encodeURIComponent(decodeURIComponent(filename))}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        },
      );

      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const data = await resp.json();
          if (data?.error) msg = data.error;
        } catch {}
        throw new Error(msg);
      }

      tr?.remove();
      rows = Array.from(
        tbody.querySelectorAll(
          "tr:not(.empty-row):not(.loading-row):not(.error-row)",
        ),
      );

      const countEl = document.getElementById("m-count");
      if (countEl) countEl.textContent = String(rows.length);

      if (emptyRow) emptyRow.hidden = rows.length !== 0;
      applySearch();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(`Failed to delete: ${err?.message || err}`);
    } finally {
      if (document.body.contains(tr)) setRowBusy(tr, false, btn);
    }
  });

  // TODO: Project share modal and functionality will be shared across multiple project-types
  // Should be refactored into a common module, update the usage here and in other project pages
  const SHARE_ROLE_LABELS = {
    owner: "Owner",
    editor: "Editor",
    viewer: "Viewer",
  };
  const SHARE_STATUS_LABELS = {
    active: "Active",
    pending: "Pending invite",
    revoked: "Revoked",
  };

  function initShareModal() {
    const main = document.querySelector("main[data-project-id]");
    if (!main) return;
    const projectId = main.dataset.projectId;
    const canView = main.dataset.shareCanView === "true";
    const canManage = main.dataset.shareCanManage === "true";
    if (!projectId || !canView) return;

    const modal = document.querySelector('[data-modal="share-project"]');
    if (!modal) return;

    const els = {
      form: modal.querySelector("[data-share-form]"),
      email: modal.querySelector("[data-share-input]"),
      role: modal.querySelector("[data-share-role]"),
      submit: modal.querySelector("[data-share-submit]"),
      error: modal.querySelector("[data-share-error]"),
      loading: modal.querySelector("[data-share-loading]"),
      empty: modal.querySelector("[data-share-empty]"),
      table: modal.querySelector("[data-share-table]"),
      rows: modal.querySelector("[data-share-rows]"),
    };

    if (!canManage && els.form) {
      els.form.style.display = "none";
    }

    const state = {
      members: [],
      loading: false,
      error: "",
      busy: new Set(),
      initialized: false,
      refreshing: false,
    };

    function setError(message) {
      state.error = message || "";
      if (!els.error) return;
      if (state.error) {
        els.error.textContent = state.error;
        els.error.style.display = "block";
      } else {
        els.error.textContent = "";
        els.error.style.display = "none";
      }
    }

    function setLoading(isLoading, { withoutRender = false } = {}) {
      state.loading = !!isLoading;
      if (els.loading) els.loading.hidden = !state.loading;
      if (!withoutRender) render();
    }

    function ownerCount() {
      return state.members.filter(
        (m) => m.role === "owner" && m.status === "active",
      ).length;
    }

    function upsertMember(member) {
      if (!member) return;
      const idx = state.members.findIndex((m) => m.id === member.id);
      if (idx >= 0) state.members[idx] = member;
      else state.members.push(member);
    }

    function removeMember(id) {
      state.members = state.members.filter((m) => m.id !== id);
    }

    function render() {
      if (state.loading && !state.initialized) {
        if (els.table) els.table.hidden = true;
        if (els.empty) els.empty.hidden = true;
        return;
      }

      const visibleMembers = state.members.filter(
        (member) => member && member.status !== "revoked",
      );

      const sorted = visibleMembers.slice().sort((a, b) => {
        const weight = { owner: 0, editor: 1, viewer: 2 };
        const wa = weight[a.role] ?? 99;
        const wb = weight[b.role] ?? 99;
        if (wa !== wb) return wa - wb;
        const nameA = (a.displayName || "").toLowerCase();
        const nameB = (b.displayName || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      if (els.loading) els.loading.hidden = !state.loading;
      if (els.empty) els.empty.hidden = state.loading || sorted.length > 0;
      if (els.table) els.table.hidden = state.loading || sorted.length === 0;
      setError(state.error);

      if (!els.rows) return;
      els.rows.innerHTML = "";

      const activeOwners = ownerCount();

      sorted.forEach((member) => {
        const row = document.createElement("tr");
        const emailDetail =
          member.email && member.email !== member.displayName
            ? `<div class="share-modal__status">${escapeHtml(member.email)}</div>`
            : "";
        const youTag = member.isSelf
          ? '<span class="share-modal__tag">You</span>'
          : "";
        const statusLabel =
          SHARE_STATUS_LABELS[member.status] || member.status || "";
        const statusClass =
          member.status === "pending" ? "share-modal__status--pending" : "";

        const disableRoleSelection =
          !canManage ||
          state.busy.has(member.id) ||
          (member.role === "owner" && member.isSelf && activeOwners <= 1);

        const roleSelect = ["owner", "editor", "viewer"]
          .map((role) => {
            const selected = role === member.role ? "selected" : "";
            return `<option value="${role}" ${selected}>${escapeHtml(SHARE_ROLE_LABELS[role] || role)}</option>`;
          })
          .join("");

        const roleCell = canManage
          ? `<select class="share-modal__role" data-share-member-role="${member.id}" ${disableRoleSelection ? "disabled" : ""}>${roleSelect}</select>`
          : `<span class="share-modal__tag">${escapeHtml(SHARE_ROLE_LABELS[member.role] || member.role)}</span>`;

        const removeBtn =
          canManage && !member.isSelf
            ? `<div class="share-modal__actions"><button type="button" class="chip" data-share-remove="${member.id}" ${state.busy.has(member.id) ? "disabled" : ""}>Remove</button></div>`
            : '<div class="share-modal__actions"></div>';

        row.innerHTML = `
          <td>
            <div>${escapeHtml(member.displayName || "Member")} ${youTag}</div>
            ${emailDetail}
          </td>
          <td>${roleCell}</td>
          <td><span class="share-modal__status ${statusClass}">${escapeHtml(statusLabel)}</span></td>
          <td>${removeBtn}</td>
        `;
        row.dataset.memberId = member.id;
        els.rows.appendChild(row);
      });
    }

    async function refreshMembers() {
      if (!projectId || state.refreshing) return;
      state.refreshing = true;
      setError("");
      setLoading(true, { withoutRender: true });
      render();
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/shares`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          },
        );
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(payload?.error || `HTTP ${resp.status}`);
        }
        state.members = Array.isArray(payload.members) ? payload.members : [];
        state.initialized = true;
      } catch (err) {
        console.error("Failed to load project members", err);
        state.members = [];
        state.initialized = true;
        setError(err?.message || "Failed to load collaborators.");
      } finally {
        state.refreshing = false;
        setLoading(false, { withoutRender: true });
        render();
      }
    }

    async function inviteMember(email, role) {
      if (!projectId || !canManage) return;
      const cleanEmail = (email || "").trim();
      if (!cleanEmail) {
        setError("Enter an email address to invite.");
        return;
      }
      if (els.submit) {
        els.submit.disabled = true;
        els.submit.textContent = "Sending…";
      }
      setError("");
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/shares`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail, role }),
          },
        );
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(payload?.error || `HTTP ${resp.status}`);
        }
        if (payload.member) {
          upsertMember(payload.member);
          render();
        } else {
          await refreshMembers();
        }
        if (els.email) els.email.value = "";
      } catch (err) {
        console.error("Failed to invite member", err);
        setError(err?.message || "Failed to invite member.");
      } finally {
        if (els.submit) {
          els.submit.disabled = false;
          els.submit.textContent = "Send invite";
        }
      }
    }

    async function updateMemberRole(memberId, role) {
      if (!projectId || !canManage || !memberId) return;
      state.busy.add(memberId);
      render();
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(memberId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
          },
        );
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(payload?.error || `HTTP ${resp.status}`);
        }
        if (payload.member) {
          upsertMember(payload.member);
        } else {
          await refreshMembers();
        }
        setError("");
      } catch (err) {
        console.error("Failed to update member role", err);
        setError(err?.message || "Failed to update member role.");
      } finally {
        state.busy.delete(memberId);
        render();
      }
    }

    async function removeMemberRequest(memberId) {
      if (!projectId || !canManage || !memberId) return;
      state.busy.add(memberId);
      render();
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(memberId)}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json" },
          },
        );
        if (!resp.ok && resp.status !== 204) {
          let payload = {};
          try {
            payload = await resp.json();
          } catch {}
          throw new Error(payload?.error || `HTTP ${resp.status}`);
        }
        removeMember(memberId);
        setError("");
        render();
      } catch (err) {
        console.error("Failed to remove member", err);
        setError(err?.message || "Failed to remove member.");
      } finally {
        state.busy.delete(memberId);
        render();
      }
    }

    if (els.form && canManage) {
      els.form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!canManage) return;
        if (els.email && !els.email.reportValidity()) return;
        inviteMember(els.email?.value, els.role?.value || "editor");
      });
    }

    if (els.rows) {
      els.rows.addEventListener("change", (event) => {
        const select = event.target.closest("[data-share-member-role]");
        if (!select) return;
        if (!canManage || select.disabled) return;
        const memberId = select.getAttribute("data-share-member-role");
        const member = state.members.find((m) => m.id === memberId);
        if (!member) return;
        const nextRole = select.value;
        if (!nextRole || nextRole === member.role) return;
        updateMemberRole(memberId, nextRole).catch(() => {
          select.value = member.role;
        });
      });

      els.rows.addEventListener("click", (event) => {
        const remover = event.target.closest("[data-share-remove]");
        if (!remover) return;
        if (!canManage || remover.disabled) return;
        const memberId = remover.getAttribute("data-share-remove");
        if (!memberId) return;
        removeMemberRequest(memberId);
      });
    }

    const modalObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type === "attributes" &&
          record.attributeName === "data-modal-active"
        ) {
          if (modal.dataset.modalActive === "true" && !state.refreshing) {
            refreshMembers();
          }
        }
      }
    });
    modalObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["data-modal-active"],
    });
  }

  // wire search & loader and kick off startup tasks
  function wireLoader() {
    const spinner = document.querySelector("[data-startup-spinner]");
    SM.onChange((state) => {
      if (!spinner) return;
      spinner.style.display = state.isLoading ? "block" : "none";
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initShareModal();
    wireLoader();
    search?.addEventListener("input", applySearch);
    retryConnectionBtn?.addEventListener("click", () => {
      const projectId = resolveProjectId();
      if (!projectId) {
        window.location.reload();
        return;
      }
      retryConnectionBtn.disabled = true;
      retryConnectionBtn.textContent = "Retrying…";
      fetch(
        `/api/projects/${encodeURIComponent(projectId)}/blog/retry-connection`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      )
        .then((resp) => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.json().catch(() => ({}));
        })
        .then(() => window.location.reload())
        .catch((err) => {
          console.error("Retry connection failed", err);
          window.alert(
            err?.message || "Failed to reconnect. Please try again later.",
          );
        })
        .finally(() => {
          retryConnectionBtn.disabled = false;
          retryConnectionBtn.textContent = "Retry connection";
        });
    });
    // run page startup tasks
    try {
      await SM.runAll({ parallel: true });
    } catch (e) {
      // errors already surfaced in UI; keep page interactive
      console.error("Startup errors", SM.getState());
    }
  });
})();
