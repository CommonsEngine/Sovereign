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

function escapeHtml(value) {
  if (!value) return "";
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function resolveBaseApi({ scope, projectId, apiBase }) {
  const configured =
    apiBase ||
    scope?.dataset?.shareApiBase ||
    (projectId ? `/api/projects/${encodeURIComponent(projectId)}/shares` : "");
  return configured.replace(/\/+$/, "");
}

export function initProjectShareModal(options = {}) {
  const scope =
    options.scope ??
    document.querySelector(options.scopeSelector ?? "main[data-project-id]");
  if (!scope) return null;

  const projectId = options.projectId ?? scope.dataset.projectId;
  const canView = options.canView ?? scope.dataset.shareCanView === "true";
  const canManage =
    options.canManage ?? scope.dataset.shareCanManage === "true";

  if (!projectId || !canView) return null;

  const modal =
    options.modal ??
    document.querySelector(
      options.modalSelector ?? '[data-modal="share-project"]',
    );
  if (!modal) return null;
  if (modal.dataset.projectShareInit === "true") {
    return modal.__projectShareController || null;
  }

  const elements = {
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

  if (!canManage && elements.form) {
    elements.form.style.display = "none";
  }

  const state = {
    members: [],
    loading: false,
    error: "",
    busy: new Set(),
    initialized: false,
    refreshing: false,
  };

  const baseApi = resolveBaseApi({
    scope,
    projectId,
    apiBase: options.apiBase,
  });
  if (!baseApi) return null;

  function setError(message) {
    state.error = message || "";
    if (!elements.error) return;
    if (state.error) {
      elements.error.textContent = state.error;
      elements.error.style.display = "block";
    } else {
      elements.error.textContent = "";
      elements.error.style.display = "none";
    }
  }

  function setLoading(isLoading, { withoutRender = false } = {}) {
    state.loading = !!isLoading;
    if (elements.loading) elements.loading.hidden = !state.loading;
    if (!withoutRender) render();
  }

  function ownerCount() {
    return state.members.filter(
      (member) => member.role === "owner" && member.status === "active",
    ).length;
  }

  function upsertMember(member) {
    if (!member) return;
    const index = state.members.findIndex((item) => item.id === member.id);
    if (index >= 0) {
      state.members[index] = member;
    } else {
      state.members.push(member);
    }
  }

  function removeMember(id) {
    state.members = state.members.filter((member) => member.id !== id);
  }

  function render() {
    if (state.loading && !state.initialized) {
      if (elements.table) elements.table.hidden = true;
      if (elements.empty) elements.empty.hidden = true;
      return;
    }

    const visibleMembers = state.members.filter(
      (member) => member && member.status !== "revoked",
    );

    const sortedMembers = visibleMembers.slice().sort((a, b) => {
      const weight = { owner: 0, editor: 1, viewer: 2 };
      const weightA = weight[a.role] ?? 99;
      const weightB = weight[b.role] ?? 99;
      if (weightA !== weightB) return weightA - weightB;
      const nameA = (a.displayName || "").toLowerCase();
      const nameB = (b.displayName || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    if (elements.loading) elements.loading.hidden = !state.loading;
    if (elements.empty)
      elements.empty.hidden = state.loading || sortedMembers.length > 0;
    if (elements.table)
      elements.table.hidden = state.loading || sortedMembers.length === 0;
    setError(state.error);

    if (!elements.rows) return;
    elements.rows.innerHTML = "";

    const activeOwners = ownerCount();

    sortedMembers.forEach((member) => {
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
      elements.rows.appendChild(row);
    });
  }

  async function refreshMembers() {
    if (state.refreshing) return;
    state.refreshing = true;
    setError("");
    setLoading(true, { withoutRender: true });
    render();
    try {
      const response = await fetch(baseApi, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      state.members = Array.isArray(payload.members) ? payload.members : [];
      state.initialized = true;
    } catch (error) {
      console.error("Failed to load project members", error);
      state.members = [];
      state.initialized = true;
      setError(error?.message || "Failed to load collaborators.");
    } finally {
      state.refreshing = false;
      setLoading(false, { withoutRender: true });
      render();
    }
  }

  async function inviteMember(email, role) {
    if (!canManage) return;
    const cleanEmail = (email || "").trim();
    if (!cleanEmail) {
      setError("Enter an email address to invite.");
      return;
    }
    if (elements.submit) {
      elements.submit.disabled = true;
      elements.submit.textContent = "Sending…";
    }
    setError("");
    try {
      const response = await fetch(baseApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      if (payload.member) {
        upsertMember(payload.member);
        render();
      } else {
        await refreshMembers();
      }
      if (elements.email) elements.email.value = "";
    } catch (error) {
      console.error("Failed to invite member", error);
      setError(error?.message || "Failed to invite member.");
    } finally {
      if (elements.submit) {
        elements.submit.disabled = false;
        elements.submit.textContent = "Send invite";
      }
    }
  }

  async function updateMemberRole(memberId, role) {
    if (!canManage || !memberId) return;
    state.busy.add(memberId);
    render();
    try {
      const response = await fetch(
        `${baseApi}/${encodeURIComponent(memberId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      if (payload.member) {
        upsertMember(payload.member);
      } else {
        await refreshMembers();
      }
      setError("");
    } catch (error) {
      console.error("Failed to update member role", error);
      setError(error?.message || "Failed to update member role.");
    } finally {
      state.busy.delete(memberId);
      render();
    }
  }

  async function removeMemberRequest(memberId) {
    if (!canManage || !memberId) return;
    state.busy.add(memberId);
    render();
    try {
      const response = await fetch(
        `${baseApi}/${encodeURIComponent(memberId)}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok && response.status !== 204) {
        let payload = {};
        try {
          payload = await response.json();
        } catch {
          /* ignore */
        }
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      removeMember(memberId);
      setError("");
      render();
    } catch (error) {
      console.error("Failed to remove member", error);
      setError(error?.message || "Failed to remove member.");
    } finally {
      state.busy.delete(memberId);
      render();
    }
  }

  const handleFormSubmit = (event) => {
    event.preventDefault();
    if (!canManage) return;
    if (elements.email && !elements.email.reportValidity()) return;
    inviteMember(elements.email?.value, elements.role?.value || "editor");
  };

  const handleRowsChange = (event) => {
    const select = event.target.closest("[data-share-member-role]");
    if (!select) return;
    if (!canManage || select.disabled) return;
    const memberId = select.getAttribute("data-share-member-role");
    const member = state.members.find((item) => item.id === memberId);
    if (!member) return;
    const nextRole = select.value;
    if (!nextRole || nextRole === member.role) return;
    updateMemberRole(memberId, nextRole).catch(() => {
      select.value = member.role;
    });
  };

  const handleRowsClick = (event) => {
    const remover = event.target.closest("[data-share-remove]");
    if (!remover) return;
    if (!canManage || remover.disabled) return;
    const memberId = remover.getAttribute("data-share-remove");
    if (!memberId) return;
    removeMemberRequest(memberId);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (
        record.type === "attributes" &&
        record.attributeName === "data-modal-active" &&
        modal.dataset.modalActive === "true" &&
        !state.refreshing
      ) {
        refreshMembers();
      }
    }
  });

  if (elements.form && canManage) {
    elements.form.addEventListener("submit", handleFormSubmit);
  }

  if (elements.rows) {
    elements.rows.addEventListener("change", handleRowsChange);
    elements.rows.addEventListener("click", handleRowsClick);
  }

  observer.observe(modal, {
    attributes: true,
    attributeFilter: ["data-modal-active"],
  });

  const controller = {
    refresh: refreshMembers,
    destroy() {
      observer.disconnect();
      if (elements.form && canManage) {
        elements.form.removeEventListener("submit", handleFormSubmit);
      }
      if (elements.rows) {
        elements.rows.removeEventListener("change", handleRowsChange);
        elements.rows.removeEventListener("click", handleRowsClick);
      }
      delete modal.dataset.projectShareInit;
      delete modal.__projectShareController;
    },
  };

  modal.dataset.projectShareInit = "true";
  modal.__projectShareController = controller;

  return controller;
}
