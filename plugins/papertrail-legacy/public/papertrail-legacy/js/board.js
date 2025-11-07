/* eslint-disable no-undef */
// --- App State ---
const $ = (sel) => document.querySelector(sel);
const toolbarEl = $(".toolbar");
const boardEl = $("#board");
const edgesSvg = $("#edges");
const statusEl = $("#status");
let saveBtn = document.getElementById("save");
const exportBtn = document.getElementById("export");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const searchInput = document.getElementById("search");
// const API_BASE = window.__globals?.apiBase || "";
const PROJECT_ID = window.__globals?.projectId || "";
const API_BASE = `/api/plugins/papertrail-legacy/${PROJECT_ID}`;
const BOARD_ENDPOINT = API_BASE ? `${API_BASE}/board` : "";
const boardIdFromGlobals = window.__globals?.boardId || "";
const isOwner = window.__globals?.canManage === "true";
const canEdit = window.__globals?.canEdit === "true" || isOwner;
let lastSavedJSON = null;

function initShareModal() {
  const mainEl = document.querySelector("main[data-project-id]");
  if (!mainEl) return;
  const projectId = mainEl.dataset.projectId;
  const canViewShare = mainEl.dataset.shareCanView === "true";
  if (!projectId || !canViewShare) return;

  // eslint-disable-next-line n/no-missing-import
  import("/js/utils/project-share.mjs")
    .then((module) => {
      const init = module?.initProjectShareModal;
      // eslint-disable-next-line promise/always-return
      if (typeof init !== "function") return;
      init({
        scope: mainEl,
        projectId,
        canView: canViewShare,
        canManage: mainEl.dataset.shareCanManage === "true",
        apiBase: mainEl.dataset.shareApiBase,
        modal: document.querySelector('[data-modal="share-project"]'),
      });
    })
    .catch((err) => {
      console.error("Failed to load project share module", err);
    });
}
initShareModal();

// --- Ensure DOM positions/sizes are synced to the model prior to save
function syncDomToModel() {
  for (const n of board.nodes) {
    const el = document.getElementById(n.id);
    if (!el) continue;
    const left = Number.parseFloat(el.style.left);
    const top = Number.parseFloat(el.style.top);
    n.x = Number.isFinite(left) ? left : el.offsetLeft || n.x || 0;
    n.y = Number.isFinite(top) ? top : el.offsetTop || n.y || 0;
    // Persist measured size so edges/auto-layout remain consistent after reload
    n.w = Math.trunc(el.offsetWidth || n.w || 0) || undefined;
    n.h = Math.trunc(el.offsetHeight || n.h || 0) || undefined;
  }
}

// Rebind the Save button to guarantee our latest handler and avoid duplicate listeners
function wireSaveButton() {
  if (!saveBtn) return;
  const oldBtn = document.getElementById("save");
  const newBtn = oldBtn.cloneNode(true); // drop prior listeners
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  saveBtn = newBtn;
  saveBtn.addEventListener("click", saveBoard);
  updateSaveButton();
}

// Ghost edge state
let ghostPath = null; // SVGPathElement
let lastMouse = { x: 0, y: 0 };

function ensureGhostPath() {
  if (!ghostPath) {
    ghostPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    ghostPath.setAttribute("class", "edge edge--ghost");
    edgesSvg.appendChild(ghostPath);
  } else if (!edgesSvg.contains(ghostPath)) {
    edgesSvg.appendChild(ghostPath);
  }
}
function hideGhost() {
  if (ghostPath) ghostPath.setAttribute("d", "");
}
function boardPointFromClient(ev) {
  const rect = boardEl.getBoundingClientRect();
  return {
    x: boardEl.scrollLeft + (ev.clientX - rect.left),
    y: boardEl.scrollTop + (ev.clientY - rect.top),
  };
}
function renderGhostEdge() {
  if (!connectMode || !connectFromId) {
    hideGhost();
    return;
  }
  const src = board.nodes.find((n) => n.id === connectFromId);
  if (!src) {
    hideGhost();
    return;
  }
  // Use the same smooth cubic logic as permanent edges
  const mx = lastMouse.x,
    my = lastMouse.y;
  const a1 = anchorPoint(src, mx, my);
  const a2 = mouseAnchor(src, mx, my);
  ensureGhostPath();
  ghostPath.setAttribute("d", smoothCubic(a1, a2));
}

function adjustBoardHeight() {
  const tb = toolbarEl ? toolbarEl.offsetHeight : 0;
  // 24px = status bar height
  boardEl.style.height = `calc(100% - ${tb}px - 24px)`;
  updateBoardExtent();
}
window.addEventListener("resize", adjustBoardHeight);

boardEl.addEventListener("mousemove", (ev) => {
  lastMouse = boardPointFromClient(ev);
  if (connectMode && connectFromId) renderGhostEdge();
});
// Also update when moving over the SVG layer (useful when pointer leaves node area)
edgesSvg.addEventListener("mousemove", (ev) => {
  lastMouse = boardPointFromClient(ev);
  if (connectMode && connectFromId) renderGhostEdge();
});

// Unified status & mode controller
const ui = {
  connectMode: false,
  status: { text: "", timer: null, sticky: false },
};
const modeHintEl = document.getElementById("modeHint");

function renderStatusBar() {
  const modeText = ui.connectMode
    ? "💡 Mode: Connect"
    : "💡 Mode: Select/Move (press C to connect)";
  if (modeHintEl) modeHintEl.textContent = modeText;
  if (statusEl) statusEl.textContent = ui.status.text || "";
}
function setConnectMode(on) {
  ui.connectMode = !!on;
  document.body.classList.toggle("connect-mode", ui.connectMode);
  const connectBtn = document.getElementById("connect");
  if (connectBtn) {
    connectBtn.classList.toggle("toolbar__btn--active", ui.connectMode);
  }

  // Disable/enable other toolbar controls
  document.querySelectorAll(".toolbar button").forEach((btn) => {
    if (btn.id === "connect") return;
    if (ui.connectMode) {
      btn.dataset.prevDisabled = btn.disabled ? "true" : "false";
      btn.disabled = true;
    } else {
      const prev = btn.dataset.prevDisabled === "true";
      if (!prev) {
        btn.disabled = false;
      }
      delete btn.dataset.prevDisabled;
    }
  });

  renderStatusBar();
}

// Show a transient status message; use {sticky:true} to persist until changed
function showStatus(msg, opts = {}) {
  const { sticky = false, ttl = 2200 } = opts;
  // Avoid flicker: ignore if message unchanged
  if (ui.status.text === msg && ui.status.sticky === sticky) return;
  ui.status.text = msg;
  ui.status.sticky = sticky;
  if (statusEl) statusEl.textContent = ui.status.text;
  if (ui.status.timer) {
    clearTimeout(ui.status.timer);
    ui.status.timer = null;
  }
  if (!sticky) {
    ui.status.timer = setTimeout(() => {
      ui.status.text = "";
      ui.status.sticky = false;
      renderStatusBar();
    }, ttl);
  }
}

// Back-compat wrappers so existing calls keep working
function setStatus(msg) {
  showStatus(msg);
}

const boardNameEl = document.getElementById("boardName");
if (boardNameEl) {
  if (!canEdit) {
    boardNameEl.setAttribute("contenteditable", "false");
    boardNameEl.classList.add("toolbar__board-name--readonly");
  } else {
    // Keep single-line feel: prevent Enter/Return from inserting new lines
    boardNameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        boardNameEl.blur();
      }
    });

    // Update model on input and enable Save
    boardNameEl.addEventListener("input", () => {
      board.title = (boardNameEl.textContent || "").trim();
      markDirty();
    });
  }

  boardNameEl.addEventListener("blur", () => {
    if (!boardNameEl.textContent || !boardNameEl.textContent.trim()) {
      boardNameEl.textContent = "Untitled Board";
    }
  });
}

function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function stableBoardSnapshot(b) {
  // Create a deterministic snapshot that ignores volatile fields (like updatedAt)
  // and normalizes numeric values so tiny float jitter doesn't flip the Save button.
  return {
    id: b.id,
    title: b.title || "",
    visibility: b.visibility || "public",
    // Normalize nodes and only include fields that affect persistence
    nodes: (b.nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      x: Math.round(n.x || 0),
      y: Math.round(n.y || 0),
      w: Number.isFinite(n.w) ? Math.round(n.w) : undefined,
      h: Number.isFinite(n.h) ? Math.round(n.h) : undefined,
      data: n.data || {},
    })),
    // Normalize edges similarly
    edges: (b.edges || []).map((e) => ({
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      label: e.label || undefined,
      dashed: !!e.dashed,
      color: e.color || undefined,
    })),
    createdAt: b.createdAt || undefined,
    // NOTE: updatedAt is intentionally excluded from snapshot comparison
  };
}
function computeSnapshot() {
  return JSON.stringify(stableBoardSnapshot(board));
}
function updateSaveButton() {
  if (!saveBtn) return;

  const snap = computeSnapshot();
  // On first run, capture a clean baseline so Save starts disabled,
  // and subsequent changes correctly enable the button.
  if (lastSavedJSON === null) {
    lastSavedJSON = snap;
    saveBtn.disabled = true;
    return;
  }
  saveBtn.disabled = snap === lastSavedJSON;
}
function markDirty() {
  if (!canEdit) return;
  // Record mutation time (not part of snapshot equivalence)
  try {
    board.updatedAt = new Date().toISOString();
  } catch (_) {}
  // Re-evaluate against the last saved snapshot so moving a node back disables Save
  updateSaveButton();
}
const ctxMenu = document.getElementById("ctxMenu");
let ctxTarget = null; // { type: 'node'|'edge', id: string }

function showContextMenu(x, y, target) {
  if (!canEdit) return;
  ctxTarget = target; // { type, id }
  const menu = ctxMenu;

  // Build menu dynamically based on target type
  if (ctxTarget && ctxTarget.type === "edge") {
    menu.innerHTML = `
            <button class="context-menu__item" data-action="label">Edit label</button>
            <button class="context-menu__item" data-action="dashed">Toggle dashed</button>
            <button class="context-menu__item" data-action="color">Set color…</button>
            <button class="context-menu__item" data-action="delete">Delete</button>
          `;
  } else {
    const node = board.nodes.find((n) => n.id === target.id);
    if (!node) {
      menu.innerHTML = "";
    } else if (node.type === "link") {
      const canEditText = !!(
        node.data &&
        typeof node.data.descHtml === "string" &&
        node.data.descHtml.trim().length
      );
      menu.innerHTML = `
      <button class="context-menu__item" data-action="edit-link-url">Edit link URL…</button>
      ${
        canEditText
          ? '<button class="context-menu__item" data-action="edit-text">Edit text…</button>'
          : ""
      }
      <button class="context-menu__item" data-action="delete">Delete</button>
    `;
    } else if (node.type === "image") {
      const canEditText = !!(
        node.data &&
        typeof node.data.descHtml === "string" &&
        node.data.descHtml.trim().length
      );
      menu.innerHTML = `
      ${
        canEditText
          ? '<button class="context-menu__item" data-action="edit-text">Edit text…</button>'
          : ""
      }
      <button class="context-menu__item" data-action="delete">Delete</button>
    `;
    } else if (node.type === "text") {
      menu.innerHTML = `
      <button class="context-menu__item" data-action="edit-text">Edit text…</button>
      <button class="context-menu__item" data-action="delete">Delete</button>
    `;
    } else {
      menu.innerHTML = `
      <button class="context-menu__item" data-action="delete">Delete</button>
    `;
    }
  }

  menu.style.display = "block";
  // constrain within window
  const mw = menu.offsetWidth || 160;
  const mh = menu.offsetHeight || 44;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let px = x,
    py = y;
  if (px + mw > vw) px = vw - mw - 8;
  if (py + mh > vh) py = vh - mh - 8;
  menu.style.left = px + "px";
  menu.style.top = py + "px";
}
function hideContextMenu() {
  ctxMenu.style.display = "none";
  ctxTarget = null;
}

// clicking elsewhere hides menu
document.addEventListener("mousedown", (ev) => {
  if (ctxMenu.style.display === "block") {
    const within = ctxMenu.contains(ev.target);
    if (!within) hideContextMenu();
  }
});

// Esc hides menu
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") hideContextMenu();
});

// Context menu actions (delegated)
ctxMenu.addEventListener("click", (ev) => {
  if (!canEdit) {
    hideContextMenu();
    return;
  }
  const btn = ev.target.closest("button");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  if (!ctxTarget) {
    hideContextMenu();
    return;
  }

  if (ctxTarget.type === "node") {
    const node = board.nodes.find((n) => n.id === ctxTarget.id);
    if (!node) {
      hideContextMenu();
      return;
    }

    if (action === "edit-text") {
      const nodeEl = document.getElementById(node.id);
      if (nodeEl) {
        const rich = nodeEl.querySelector(".rich");
        if (rich) {
          // enter edit mode
          rich.setAttribute("contenteditable", "true");
          nodeEl.classList.add("node--editing");
          setTimeout(() => {
            try {
              placeCaretAtEnd(rich);
            } catch (_) {}
            rich.focus();
          }, 0);
        }
      }
      hideContextMenu();
      return;
    }

    if (action === "delete") {
      selectedNodeId = ctxTarget.id;
      selectedEdgeId = null;
      hideContextMenu();
      removeSelection();
      return;
    }

    if (action === "edit-link-url" && node.type === "link") {
      const val = prompt("Link URL:", node.data.linkUrl || "https://");
      if (val !== null) {
        const url = (val || "").trim();
        if (url) {
          node.data.linkUrl = url;
          // Invalidate previous preview so it refetches
          delete node.data.preview;
          hideContextMenu();
          markDirty();
          renderNode(node);
          renderEdges();
        }
      }
      return;
    }
    hideContextMenu();
    return;
  }

  // Edge actions
  const edge = board.edges.find((e) => e.id === ctxTarget.id);
  if (!edge) {
    hideContextMenu();
    return;
  }

  if (action === "delete") {
    selectedEdgeId = edge.id;
    selectedNodeId = null;
    hideContextMenu();
    removeSelection();
  } else if (action === "label") {
    const val = prompt("Edge label:", edge.label || "");
    if (val !== null) {
      edge.label = val.trim();
      hideContextMenu();
      markDirty();
      renderEdges();
    }
  } else if (action === "dashed") {
    edge.dashed = !edge.dashed;
    hideContextMenu();
    markDirty();
    renderEdges();
  } else if (action === "color") {
    const val = prompt(
      "Stroke color (e.g. #f87171 or red). Leave blank to reset:",
      edge.color || ""
    );
    if (val === null) return;
    const v = val.trim();
    if (v === "") delete edge.color;
    else edge.color = v;
    hideContextMenu();
    markDirty();
    renderEdges();
  }
});

function normalizeIncomingBoard(raw = {}) {
  const fallbackId =
    raw.id || boardIdFromGlobals || `board_${Math.random().toString(36).slice(2, 8)}`;
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map((n, idx) => {
        const nodeId = n?.id || `n_${Math.random().toString(36).slice(2, 8)}_${idx}`;
        const baseData =
          n && typeof n.data === "object" && n.data !== null
            ? { ...n.data }
            : {
                title: n?.title ?? null,
                text: n?.text ?? null,
                html: n?.html ?? null,
                descHtml: n?.descHtml ?? null,
                linkUrl: n?.linkUrl ?? null,
                imageUrl: n?.imageUrl ?? null,
                tags: Array.isArray(n?.tags) ? [...n.tags] : [],
                meta: typeof n?.meta === "object" && n.meta !== null ? { ...n.meta } : {},
              };
        if (!Array.isArray(baseData.tags)) baseData.tags = [];
        if (!baseData.meta || typeof baseData.meta !== "object") {
          baseData.meta = {};
        }
        return {
          id: nodeId,
          type: n?.type || "text",
          x: Number.isFinite(n?.x) ? Math.trunc(n.x) : 120 + idx * 24,
          y: Number.isFinite(n?.y) ? Math.trunc(n.y) : 120 + idx * 16,
          w: Number.isFinite(n?.w) ? Math.trunc(n.w) : undefined,
          h: Number.isFinite(n?.h) ? Math.trunc(n.h) : undefined,
          data: baseData,
        };
      })
    : [];
  const edges = Array.isArray(raw.edges)
    ? raw.edges
        .filter((edge) => edge && edge.sourceId && edge.targetId)
        .map((edge, idx) => ({
          id: edge.id || `e_${Math.random().toString(36).slice(2, 8)}_${idx}`,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          label: edge.label ?? null,
          dashed: !!edge.dashed,
          color: edge.color ?? null,
        }))
    : [];
  return {
    id: fallbackId,
    title: raw.title || window.__globals.boardTitle || "Untitled Board",
    visibility: (
      raw.visibility ||
      raw.project?.scope ||
      window.__globals.boardVisibility ||
      "private"
    ).toLowerCase(),
    status: (
      raw.status ||
      raw.project?.status ||
      window.__globals.boardStatus ||
      "draft"
    ).toLowerCase(),
    schemaVersion: raw.schemaVersion ?? window.__globals.schemaVersion ?? 1,
    layout: raw.layout ?? null,
    meta: typeof raw.meta === "object" && raw.meta !== null ? { ...raw.meta } : {},
    nodes,
    edges,
    createdAt: raw.createdAtISO || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAtISO || raw.updatedAt || new Date().toISOString(),
  };
}

function syncGlobalsFromBoard(b) {
  if (!b || typeof window === "undefined" || !window.__globals) return;
  window.__globals.boardId = b.id || window.__globals.boardId || "";
  window.__globals.boardTitle = b.title || window.__globals.boardTitle || "";
  window.__globals.boardVisibility = b.visibility || window.__globals.boardVisibility || "private";
  window.__globals.boardStatus = b.status || window.__globals.boardStatus || "draft";
  window.__globals.schemaVersion = b.schemaVersion || window.__globals.schemaVersion || 1;
}

let selectedNodeId = null;
let selectedEdgeId = null;
let connectMode = false;
let connectFromId = null;
let visibleNodeIds = null; // Set<string>
let currentQuery = "";

let board = normalizeIncomingBoard(window.__globals.initialBoard || {});
syncGlobalsFromBoard(board);

boardNameEl.textContent = board.title || "";
updateSaveButton();
wireSaveButton();
render();
applySearchFilter();
renderStatusBar();
adjustBoardHeight();

async function persistBoard(payload, method = "POST") {
  if (!BOARD_ENDPOINT) {
    throw new Error("Board endpoint unavailable");
  }
  const resp = await window.fetch(BOARD_ENDPOINT, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || "Request failed");
  }
  const normalized = normalizeIncomingBoard(data.board || data);
  syncGlobalsFromBoard(normalized);
  return normalized;
}

function buildSavePayload() {
  const nodes = board.nodes.map((n) => {
    const data = n.data ? { ...n.data } : {};
    if (Array.isArray(data.tags)) data.tags = [...data.tags];
    if (!Array.isArray(data.tags)) data.tags = [];
    if (typeof data.meta === "object" && data.meta !== null) {
      data.meta = { ...data.meta };
    }
    return {
      id: n.id,
      type: n.type,
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      data,
    };
  });

  const edges = board.edges.map((e) => ({
    id: e.id,
    sourceId: e.sourceId,
    targetId: e.targetId,
    label: e.label ?? null,
    dashed: !!e.dashed,
    color: e.color ?? null,
  }));

  return {
    id: board.id,
    title: board.title || "Untitled Board",
    visibility: board.visibility || window.__globals.boardVisibility || "private",
    status: board.status || window.__globals.boardStatus || "draft",
    schemaVersion: board.schemaVersion || window.__globals.schemaVersion || 1,
    layout: board.layout ?? null,
    meta: board.meta ?? {},
    nodes,
    edges,
  };
}

const genId = (p = "id") => p + "-" + Math.random().toString(36).slice(2, 8);

function addNode(type, at = { x: 100, y: 100 }, payload = {}) {
  if (!canEdit) {
    showStatus("You don’t have permission to add nodes.", { sticky: true });
    return null;
  }
  const id = genId("n");
  const base = {
    id,
    type,
    x: at.x,
    y: at.y,
    w: 240,
    h: undefined,
    data: {},
  };
  if (type === "text") {
    base.data.text = payload.text ?? "New note...";
    base.data.html = escapeHtml(base.data.text);
    base.data.title = payload.title ?? "Text";
  } else if (type === "image") {
    // Ask for URL if not provided; cancel = no node
    let url = payload.imageUrl;
    if (url === undefined) {
      url = prompt("Image URL?", "");
    }
    if (url === null) return null; // user cancelled
    url = (url || "").trim();
    if (!url) return null; // empty -> abort
    base.data.imageUrl = url;
    base.data.title = payload.title ?? "Image";
    base.data.descHtml = payload.descHtml ?? ""; // optional description (rich)
  } else if (type === "link") {
    // Ask for URL if not provided; cancel = no node
    let url = payload.linkUrl;
    if (url === undefined) {
      url = prompt("Link URL?", "https://");
    }
    if (url === null) return null; // user cancelled
    url = (url || "").trim();
    if (!url) return null; // empty -> abort
    base.data.linkUrl = url;
    base.data.title = payload.title ?? "Link";
    base.data.descHtml = payload.descHtml ?? ""; // optional description (rich)
  }
  board.nodes.push(base);
  markDirty();
  render();
  return base;
}

function addEdge(sourceId, targetId) {
  if (!canEdit) return;
  if (!sourceId || !targetId || sourceId === targetId) return;
  const already = board.edges.find((e) => e.sourceId === sourceId && e.targetId === targetId);
  if (already) return;
  board.edges.push({ id: genId("e"), sourceId, targetId });
  markDirty();
  renderEdges();
}

function removeSelection() {
  if (!canEdit) return;
  if (selectedNodeId) {
    board.edges = board.edges.filter(
      (e) => e.sourceId !== selectedNodeId && e.targetId !== selectedNodeId
    );
    board.nodes = board.nodes.filter((n) => n.id !== selectedNodeId);
    setStatus("Node deleted.");
    selectedNodeId = null;
  } else if (selectedEdgeId) {
    board.edges = board.edges.filter((e) => e.id !== selectedEdgeId);
    setStatus("Edge deleted.");
    selectedEdgeId = null;
  }
  markDirty();
  render();
}

function nodeBounds(n) {
  const el = document.getElementById(n.id);
  if (el) {
    // Use live DOM position to prevent model/view drift after save
    const left = Number.parseFloat(el.style.left) || el.offsetLeft || n.x || 0;
    const top = Number.parseFloat(el.style.top) || el.offsetTop || n.y || 0;
    const w = n.w || el.offsetWidth || 200;
    const h = n.h || el.offsetHeight || 80;
    return { x: left, y: top, w, h };
  }
  // Fallback to model values if DOM element isn't mounted yet
  return {
    x: n.x,
    y: n.y,
    w: n.w || 200,
    h: n.h || 80,
  };
}

function centerOf(n) {
  const b = nodeBounds(n);
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

function renderNode(n) {
  let el = document.getElementById(n.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "node node--" + n.type;
    el.id = n.id;
    el.innerHTML = `
            <div class="node__title editable-hint" contenteditable="false" data-placeholder="Untitled"></div>
            <div class="node__content"></div>
            <div class="node__ports"><div class="node__port"></div></div>
          `;
    boardEl.appendChild(el);

    // add resize handle
    const resizer = document.createElement("div");
    resizer.className = "node__resizer";
    el.appendChild(resizer);

    let resizing = false;
    let startW = 0,
      startH = 0,
      startX = 0,
      startY = 0;
    resizer.addEventListener("mousedown", (ev) => {
      ev.stopPropagation();
      if (!canEdit) return;
      resizing = true;
      startX = ev.clientX;
      startY = ev.clientY;
      startW = el.offsetWidth;
      startH = el.offsetHeight;
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (ev) => {
      if (!resizing) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      const maxW = 640,
        maxH = 600;
      const baseMinW = 160,
        baseMinH = 80;

      // Desired width from drag, clamped to base min/max
      let nextW = Math.max(baseMinW, Math.min(maxW, Math.round(startW + dx)));
      // Apply width first to let text wrap and images scale, then measure content height
      el.style.width = nextW + "px";
      el.style.height = "auto";

      // Content-required height (includes title, content, tags, ports, etc.)
      const contentMinH = Math.ceil(el.scrollHeight);

      // Desired height from drag, but never below content-required height
      let nextH = Math.max(baseMinH, Math.min(maxH, Math.round(startH + dy)));
      nextH = Math.max(nextH, contentMinH);

      // Commit
      n.w = nextW;
      n.h = nextH;
      el.style.height = nextH + "px";

      updateBoardExtent();
      renderEdges();
    });
    window.addEventListener("mouseup", () => {
      if (!resizing) return;
      resizing = false;
      document.body.style.userSelect = "";
      markDirty();
      updateSaveButton();
    });

    // select on click
    el.addEventListener("mousedown", (ev) => {
      if (ev.target && ev.target.closest(".node__resizer")) return;
      // if connect mode, handle port click like connection
      if (connectMode) {
        if (!connectFromId) {
          connectFromId = n.id;
          showStatus("Source selected. Pick a target.", { ttl: 2200 });
          renderGhostEdge();
        } else {
          addEdge(connectFromId, n.id);
          connectFromId = null;
          hideGhost();
          showStatus("Connected.", { ttl: 1800 });
        }
        ev.stopPropagation();
        return;
      }
      selectedEdgeId = null;
      selectedNodeId = n.id;
      updateSelections();
    });
    // right-click to open context menu for this node
    el.addEventListener("contextmenu", (ev) => {
      // If right-click occurs inside an editable rich text area, allow native menu for copy/paste
      const richTarget = ev.target && ev.target.closest(".rich");
      if (richTarget && richTarget.getAttribute("contenteditable") === "true") {
        return; // let the browser show its native menu
      }
      ev.preventDefault();
      selectedEdgeId = null;
      selectedNodeId = n.id;
      updateSelections();
      // show menu at mouse position
      showContextMenu(ev.clientX, ev.clientY, { type: "node", id: n.id });
    });
    // drag
    let dragging = false,
      offX = 0,
      offY = 0;
    el.addEventListener("mousedown", (ev) => {
      if (!canEdit) return;
      if (ev.target && ev.target.closest(".node__resizer")) return;
      dragging = true;
      offX = ev.clientX - n.x;
      offY = ev.clientY - n.y;
    });
    window.addEventListener("mousemove", (ev) => {
      if (!dragging) return;
      n.x = ev.clientX - offX;
      n.y = ev.clientY - offY;
      el.style.left = n.x + "px";
      el.style.top = n.y + "px";
      updateBoardExtent();
      renderEdges(); // update edge positions live
    });
    window.addEventListener("mouseup", () => {
      if (dragging) {
        dragging = false;
        markDirty();
        updateSaveButton();
      }
    });

    // inline edits
    const titleEl = el.querySelector(".node__title");
    titleEl.addEventListener("input", () => {
      if (!canEdit) return;
      n.data.title = titleEl.textContent || "";
      markDirty();
      updateBoardExtent();
      renderEdges(); // keep connections glued to borders as size changes
    });
    // Make title editable only after a double-click
    let _preEditTitle = null;
    function placeCaretAtEnd(node) {
      const r = document.createRange();
      r.selectNodeContents(node);
      r.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    titleEl.addEventListener("dblclick", (ev) => {
      if (!canEdit) return;
      ev.stopPropagation();
      _preEditTitle = titleEl.textContent;
      titleEl.setAttribute("contenteditable", "true");
      // focus at end
      setTimeout(() => {
        titleEl.focus();
        placeCaretAtEnd(titleEl);
      }, 0);
    });
    // Press Enter to commit, Esc to cancel
    titleEl.addEventListener("keydown", (ev) => {
      if (!canEdit) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        titleEl.blur();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        if (_preEditTitle != null) titleEl.textContent = _preEditTitle;
        titleEl.blur();
      }
    });
    titleEl.addEventListener("blur", () => {
      // When leaving edit mode, lock it back
      titleEl.setAttribute("contenteditable", "false");
      _preEditTitle = null;
    });
    el.addEventListener("dblclick", (ev) => {
      if (!canEdit) return;
      if (n.type === "text") {
        const rich = el.querySelector(".rich");
        const rtb = el.querySelector(".rtb");
        if (rich) {
          rich.setAttribute("contenteditable", "true");
          el.classList.add("node--editing");
          setTimeout(() => {
            try {
              placeCaretAtEnd(rich);
            } catch (_) {}
            rich.focus();
          }, 0);
          if (rtb) rtb.style.display = "";
        }
        return; // no prompt
      }

      if (n.type === "image") {
        // Only trigger URL edit when the actual image is double-clicked
        const imgEl = ev.target && ev.target.closest("img");
        if (!imgEl || !el.contains(imgEl)) return; // ignore dblclicks elsewhere in the node
        const url = prompt("Edit image URL:", n.data.imageUrl ?? "");
        if (url !== null) n.data.imageUrl = url;
        renderNode(n);
        renderEdges();
        markDirty();
        return;
      }
    });
  }

  el.style.left = n.x + "px";
  el.style.top = n.y + "px";
  if (n.w) el.style.width = n.w + "px";
  else el.style.removeProperty("width");
  if (n.h) el.style.height = n.h + "px";
  else el.style.removeProperty("height");
  el.classList.toggle("selected", selectedNodeId === n.id);
  // Ensure node type modifier class follows BEM: node--{type}
  el.classList.forEach((c) => {
    if ((c.startsWith("node-") || c.startsWith("node--")) && c !== "node") {
      el.classList.remove(c);
    }
  });
  el.classList.add("node--" + n.type);

  const titleEl = el.querySelector(".node__title");
  titleEl.setAttribute(
    "data-placeholder",
    n.type === "text" ? "Text title" : n.type === "image" ? "Image title" : "Link title"
  );
  // Preserve existing title; allow empty to show placeholder
  titleEl.textContent =
    typeof n.data.title === "string"
      ? n.data.title
      : n.type === "text"
        ? "Text"
        : n.type === "image"
          ? "Image"
          : "Link";

  const contentEl = el.querySelector(".node__content");
  if (n.type === "text") {
    const html = n.data.html ?? (n.data.text ? escapeHtml(n.data.text) : "");
    contentEl.innerHTML = `
            <div class="rtb" role="toolbar" aria-label="Text formatting">
              <button data-cmd="bold" title="Bold">B</button>
              <button data-cmd="italic" title="Italic"><i>I</i></button>
              <button data-cmd="underline" title="Underline"><u>U</u></button>
              <button data-cmd="insertUnorderedList" title="Bullet list">••</button>
              <button data-cmd="insertOrderedList" title="Numbered list">1.</button>
              <button data-action="link" title="Insert link">🔗</button>
              <button data-action="clear" title="Clear formatting">⨯</button>
            </div>
            <div class="rich" contenteditable="false" data-placeholder="Type text…">${html}</div>`;
  } else if (n.type === "image") {
    const desc = n.data.descHtml ?? "";
    contentEl.innerHTML = n.data.imageUrl
      ? `<img src="${escapeAttr(n.data.imageUrl)}" alt="">` +
        (() => {
          const hasDesc = !!(n.data.descHtml && n.data.descHtml.trim());
          const wrapDisplay = hasDesc ? "" : 'style="display:none"';
          const addBtn = hasDesc
            ? ""
            : `<button class="add-desc" type="button">+ Add description</button>`;
          return `
                  ${addBtn}
                  <div class="rtb" role="toolbar" aria-label="Text formatting" ${wrapDisplay}>
                    <button data-cmd="bold" title="Bold">B</button>
                    <button data-cmd="italic" title="Italic"><i>I</i></button>
                    <button data-cmd="underline" title="Underline"><u>U</u></button>
                    <button data-cmd="insertUnorderedList" title="Bullet list">••</button>
                    <button data-cmd="insertOrderedList" title="Numbered list">1.</button>
                    <button data-action="link" title="Insert link">🔗</button>
                    <button data-action="clear" title="Clear formatting">⨯</button>
                  </div>
                  <div class="rich" contenteditable="false" data-field="descHtml" data-placeholder="Add a description…" ${wrapDisplay}>${
                    n.data.descHtml ?? ""
                  }</div>
                `;
        })()
      : `<em>No image</em>`;
    // Wire up Add description toggler
    const addDescBtn = el.querySelector(".add-desc");
    if (addDescBtn) {
      addDescBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const rtb = el.querySelector(".rtb");
        const rich = el.querySelector('.rich[data-field="descHtml"]');
        if (rtb) rtb.style.display = "";
        if (rich) {
          rich.style.display = "";
          rich.setAttribute("contenteditable", "true");
          el.classList.add("node--editing");
          setTimeout(() => {
            try {
              placeCaretAtEnd(rich);
            } catch (_) {}
            rich.focus();
          }, 0);
        }
        addDescBtn.remove();
      });
    }
  } else if (n.type === "link") {
    const u = n.data.linkUrl ?? "";
    const desc = n.data.descHtml ?? "";
    if (!u) {
      contentEl.innerHTML = `<em>No link</em>`;
    } else if (n.data.preview) {
      const hasDesc = !!(n.data.descHtml && n.data.descHtml.trim());
      const wrapDisplay = hasDesc ? "" : 'style="display:none"';
      const addBtn = hasDesc
        ? ""
        : `<button class="add-desc" type="button">+ Add description</button>`;
      contentEl.innerHTML =
        renderLinkCard(n.data.preview, u) +
        `${addBtn}
               <div class="rtb" role="toolbar" aria-label="Text formatting" ${wrapDisplay}>
                 <button data-cmd="bold" title="Bold">B</button>
                 <button data-cmd="italic" title="Italic"><i>I</i></button>
                 <button data-cmd="underline" title="Underline"><u>U</u></button>
                 <button data-cmd="insertUnorderedList" title="Bullet list">••</button>
                 <button data-cmd="insertOrderedList" title="Numbered list">1.</button>
                 <button data-action="link" title="Insert link">🔗</button>
                 <button data-action="clear" title="Clear formatting">⨯</button>
               </div>
               <div class="rich" contenteditable="false" data-field="descHtml" data-placeholder="Add a description…" ${wrapDisplay}>${desc}</div>`;
    } else {
      // initial minimal view while loading
      const hasDesc = !!(n.data.descHtml && n.data.descHtml.trim());
      const wrapDisplay = hasDesc ? "" : 'style="display:none"';
      const addBtn = hasDesc
        ? ""
        : `<button class="add-desc" type="button">+ Add description</button>`;
      contentEl.innerHTML =
        `<a href="${escapeAttr(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>` +
        `<div style="margin-top:6px;color:#9ca3af;font-size:12px;">Loading preview…</div>` +
        `${addBtn}
               <div class="rtb" role="toolbar" aria-label="Text formatting" ${wrapDisplay}>
                 <button data-cmd="bold" title="Bold">B</button>
                 <button data-cmd="italic" title="Italic"><i>I</i></button>
                 <button data-cmd="underline" title="Underline"><u>U</u></button>
                 <button data-cmd="insertUnorderedList" title="Bullet list">••</button>
                 <button data-cmd="insertOrderedList" title="Numbered list">1.</button>
                 <button data-action="link" title="Insert link">🔗</button>
                 <button data-action="clear" title="Clear formatting">⨯</button>
               </div>
               <div class="rich" contenteditable="false" data-field="descHtml" data-placeholder="Add a description…" ${wrapDisplay}>${desc}</div>`;
      // kick off preview fetch (once)
      (async () => {
        const p = await fetchLinkPreview(u);
        if (p) {
          n.data.preview = p;
          markDirty();
          renderNode(n);
          renderEdges();
        }
      })();
    }
    // Wire up Add description toggler for Link
    const addDescBtnL = el.querySelector(".add-desc");
    if (addDescBtnL) {
      addDescBtnL.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const rtb = el.querySelector(".rtb");
        const rich = el.querySelector('.rich[data-field="descHtml"]');
        if (rtb) rtb.style.display = "";
        if (rich) {
          rich.style.display = "";
          rich.setAttribute("contenteditable", "true");
          el.classList.add("node--editing");
          setTimeout(() => {
            try {
              placeCaretAtEnd(rich);
            } catch (_) {}
            rich.focus();
          }, 0);
        }
        addDescBtnL.remove();
      });
    }
  }

  // Tags UI (common to all types)
  let tagsWrap = el.querySelector(".tags");
  if (!tagsWrap) {
    tagsWrap = document.createElement("div");
    tagsWrap.className = "tags";
    el.querySelector(".node__content").appendChild(tagsWrap);
  }
  renderTagChips(n, tagsWrap);

  let addTagBtn = el.querySelector(".add-tag");
  if (!addTagBtn) {
    addTagBtn = document.createElement("button");
    addTagBtn.className = "add-tag";
    addTagBtn.textContent = "+ tag";
    el.querySelector(".node__content").appendChild(addTagBtn);
    addTagBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const input = prompt("Add tags (comma separated or single #tag):");
      if (!input) return;
      const parts = input
        .split(",")
        .map((s) => normalizeTag(s))
        .filter(Boolean);
      const tags = ensureTags(n);
      for (const t of parts) {
        if (!tags.includes(t)) tags.push(t);
      }
      renderTagChips(n, tagsWrap);
      markDirty();
    });
  }
  // Attach rich text toolbar listeners (Text uses data.html; Image/Link use data.descHtml)
  {
    const rtb = el.querySelector(".rtb");
    const rich = el.querySelector(".rich");
    if (rtb && rich) {
      const field = n.type === "text" ? "html" : "descHtml";
      const isOptionalDesc = field === "descHtml" && (n.type === "image" || n.type === "link");

      function startEditing() {
        if (rich.getAttribute("contenteditable") === "true") return;
        rich.setAttribute("contenteditable", "true");
        el.classList.add("node--editing");
        setTimeout(() => {
          try {
            placeCaretAtEnd(rich);
          } catch (_) {}
          rich.focus();
        }, 0);
      }
      function stopEditing() {
        if (rich.getAttribute("contenteditable") !== "true") return;
        rich.setAttribute("contenteditable", "false");
        el.classList.remove("node--editing");
      }

      function ensureAddDescButton() {
        if (!isOptionalDesc) return;
        let addBtn = el.querySelector(".add-desc");
        if (!addBtn) {
          addBtn = document.createElement("button");
          addBtn.className = "add-desc";
          addBtn.type = "button";
          addBtn.textContent = "+ Add description";
          addBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            if (rtb) rtb.style.display = "";
            if (rich) {
              rich.style.display = "";
              startEditing();
            }
            addBtn.remove();
          });
          el.querySelector(".node__content").insertBefore(addBtn, rtb);
        }
      }

      function maybeCollapseIfEmpty() {
        if (!isOptionalDesc) return;
        const plain = (rich.textContent || "").trim();
        if (!plain.length) {
          n.data.descHtml = "";
          if (rtb) rtb.style.display = "none";
          if (rich) {
            rich.style.display = "none";
            rich.innerHTML = "";
          }
          ensureAddDescButton();
        }
      }

      // Enter editing on double click inside the rich area
      rich.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        startEditing();
      });

      // Keep focus and ensure editing when interacting with the toolbar
      rtb.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        startEditing();
      });
      rtb.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button");
        if (!btn) return;
        const cmd = btn.getAttribute("data-cmd");
        const act = btn.getAttribute("data-action");
        startEditing();
        if (cmd) {
          document.execCommand(cmd, false, null);
          n.data[field] = rich.innerHTML;
          markDirty();
          renderEdges();
          maybeCollapseIfEmpty();
        } else if (act === "link") {
          const url = prompt("Link URL", "https://");
          if (url) document.execCommand("createLink", false, url);
          n.data[field] = rich.innerHTML;
          markDirty();
          maybeCollapseIfEmpty();
        } else if (act === "clear") {
          document.execCommand("removeFormat");
          const a = rich.querySelector("a");
          if (a) {
            const t = document.createTextNode(a.textContent || "");
            a.replaceWith(t);
          }
          rich.innerHTML = "";
          n.data[field] = "";
          markDirty();
          maybeCollapseIfEmpty();
        }
      });

      const syncHtml = () => {
        n.data[field] = rich.innerHTML;
        markDirty();
        maybeCollapseIfEmpty();
      };
      rich.addEventListener("input", syncHtml);
      rich.addEventListener("blur", () => {
        syncHtml();
        stopEditing();
      });
      rich.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          stopEditing();
          rich.blur();
        } else if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          syncHtml();
          stopEditing();
          rich.blur();
        }
      });
    }
  }
  // Toggle resizer visibility based on node type (text, image, link are resizable)
  const resizerEl = el.querySelector(".node__resizer");
  if (resizerEl) {
    resizerEl.style.display =
      n.type === "text" || n.type === "image" || n.type === "link" ? "" : "none";
  }
}

function renderNodes() {
  // Remove DOM nodes that no longer exist in data
  const ids = new Set(board.nodes.map((n) => n.id));
  document.querySelectorAll(".node").forEach((el) => {
    if (!ids.has(el.id)) el.remove();
  });
  board.nodes.forEach(renderNode);
}

// Compute an anchor point on the boundary of node n that faces (ox, oy)
function anchorPoint(n, ox, oy) {
  const b = nodeBounds(n);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = ox - cx;
  const dy = oy - cy;

  // Choose side by dominant axis
  if (Math.abs(dx) > Math.abs(dy)) {
    // left/right
    if (dx >= 0) {
      return { x: b.x + b.w, y: cy, side: "right" };
    } else {
      return { x: b.x, y: cy, side: "left" };
    }
  } else {
    // top/bottom
    if (dy >= 0) {
      return { x: cx, y: b.y + b.h, side: "bottom" };
    } else {
      return { x: cx, y: b.y, side: "top" };
    }
  }
}

// Build a synthetic “target” anchor at the mouse so the curve bends nicely.
// We pick the side opposite to where the mouse is relative to the source node,
// so control points push outward (pleasant S-curve).
function mouseAnchor(fromNode, mx, my) {
  const b = nodeBounds(fromNode);
  const cx = b.x + (b.w || 0) / 2;
  const cy = b.y + (b.h || 0) / 2;
  const dx = mx - cx;
  const dy = my - cy;
  let side;
  if (Math.abs(dx) > Math.abs(dy)) {
    side = dx >= 0 ? "left" : "right"; // opposite of mouse horizontal side
  } else {
    side = dy >= 0 ? "top" : "bottom"; // opposite of mouse vertical side
  }
  return { x: mx, y: my, side };
}

// Smooth cubic path between two anchors, with curvature adaptive to distance
function smoothCubic(a, b) {
  const x1 = a.x,
    y1 = a.y,
    x2 = b.x,
    y2 = b.y;
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const d = Math.max(dx, dy);
  const c = Math.min(160, Math.max(40, d * 0.6)); // curvature

  let c1x = x1,
    c1y = y1,
    c2x = x2,
    c2y = y2;

  // Push control points outward from each side
  switch (a.side) {
    case "right":
      c1x += c;
      break;
    case "left":
      c1x -= c;
      break;
    case "top":
      c1y -= c;
      break;
    case "bottom":
      c1y += c;
      break;
  }
  switch (b.side) {
    case "right":
      c2x -= c;
      break;
    case "left":
      c2x += c;
      break;
    case "top":
      c2y += c;
      break;
    case "bottom":
      c2y -= c;
      break;
  }

  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

function computeContentExtent(pad = 160) {
  let maxX = 0,
    maxY = 0;
  for (const n of board.nodes) {
    const b = nodeBounds(n);
    const w = b.w || 240;
    const h = b.h || 100;
    maxX = Math.max(maxX, b.x + w);
    maxY = Math.max(maxY, b.y + h);
  }
  const rect = boardEl.getBoundingClientRect();
  const w = Math.max(maxX + pad, rect.width);
  const h = Math.max(maxY + pad, rect.height);
  return { w, h };
}

function updateBoardExtent() {
  const { w, h } = computeContentExtent(160);
  const sizer = document.getElementById("boardSizer");
  if (sizer) {
    sizer.style.width = w + "px";
    sizer.style.height = h + "px";
  }
  edgesSvg.setAttribute("width", w);
  edgesSvg.setAttribute("height", h);
  edgesSvg.style.width = w + "px";
  edgesSvg.style.height = h + "px";
}

function renderEdges() {
  edgesSvg.innerHTML = "";
  updateBoardExtent();
  if (!visibleNodeIds) {
    visibleNodeIds = new Set(board.nodes.map((n) => n.id));
  }

  for (const e of board.edges) {
    const s = board.nodes.find((n) => n.id === e.sourceId);
    const t = board.nodes.find((n) => n.id === e.targetId);
    if (!s || !t) continue;
    if (!visibleNodeIds.has(s.id) || !visibleNodeIds.has(t.id)) continue;
    const sc = centerOf(s);
    const tc = centerOf(t);
    const a1 = anchorPoint(s, tc.cx, tc.cy);
    const a2 = anchorPoint(t, sc.cx, sc.cy);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-id", e.id);

    // Path
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", smoothCubic(a1, a2));
    let cls = "edge" + (selectedEdgeId === e.id ? " edge--selected" : "");
    if (e.dashed) cls += " edge--dashed";
    path.setAttribute("class", cls);
    if (e.color) {
      // Use inline style so it overrides the .edge CSS rule
      path.style.stroke = e.color;
    } else {
      path.style.stroke = null; // fall back to CSS (.edge { stroke: red; })
    }
    path.dataset.id = e.id;

    // Label (optional)
    if (e.label) {
      const tx = (a1.x + a2.x) / 2;
      const ty = (a1.y + a2.y) / 2 - 2; // closer to the curve
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", tx);
      text.setAttribute("y", ty);
      text.setAttribute("class", "edge__label");
      text.textContent = e.label;

      // Click/ctx on label behave like the edge
      text.addEventListener("click", (ev) => {
        selectedNodeId = null;
        selectedEdgeId = e.id;
        updateSelections();
        ev.stopPropagation();
        return false;
      });
      text.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        selectedNodeId = null;
        selectedEdgeId = e.id;
        updateSelections();
        showContextMenu(ev.clientX, ev.clientY, {
          type: "edge",
          id: e.id,
        });
        return false;
      });
      g.appendChild(text);
    }

    // Events on path
    path.addEventListener("click", (ev) => {
      selectedNodeId = null;
      selectedEdgeId = e.id;
      updateSelections();
      ev.stopPropagation();
      return false;
    });
    path.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      selectedNodeId = null;
      selectedEdgeId = e.id;
      updateSelections();
      showContextMenu(ev.clientX, ev.clientY, { type: "edge", id: e.id });
      return false;
    });

    g.appendChild(path);

    // Add endpoint circles
    const startCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    startCircle.setAttribute("cx", a1.x);
    startCircle.setAttribute("cy", a1.y);
    startCircle.setAttribute("r", "4");
    startCircle.setAttribute("class", "edge__endpoint");

    const endCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    endCircle.setAttribute("cx", a2.x);
    endCircle.setAttribute("cy", a2.y);
    endCircle.setAttribute("r", "4");
    endCircle.setAttribute("class", "edge__endpoint");

    g.appendChild(startCircle);
    g.appendChild(endCircle);

    edgesSvg.appendChild(g);
  }
  // Re-draw ghost on top if we're mid-connection
  if (connectMode && connectFromId) {
    renderGhostEdge();
  } else {
    hideGhost();
  }
}

function updateSelections() {
  // nodes
  document.querySelectorAll(".node").forEach((el) => {
    el.classList.toggle("selected", el.id === selectedNodeId);
  });
  // edges
  document.querySelectorAll("path.edge").forEach((p) => {
    p.classList.toggle("edge--selected", p.dataset.id === selectedEdgeId);
  });
}

function render() {
  renderNodes();
  renderEdges();
  applySearchFilter();
  adjustBoardHeight();
}

function escapeHtml(s) {
  return (s ?? "").toString().replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );
}
function escapeAttr(s) {
  return escapeHtml(s);
}

function ensureTags(n) {
  if (!n.data) n.data = {};
  if (!Array.isArray(n.data.tags)) n.data.tags = [];
  return n.data.tags;
}
function normalizeTag(t) {
  return (t || "").toString().trim().replace(/^#+/, "").toLowerCase();
}
function renderTagChips(n, hostEl) {
  const tags = ensureTags(n);
  hostEl.innerHTML = "";
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `<span>#${escapeHtml(
      tag
    )}</span> <button title="Remove tag" data-i="${i}">✕</button>`;
    chip.querySelector("button").addEventListener("click", (ev) => {
      ev.stopPropagation();
      tags.splice(i, 1);
      renderTagChips(n, hostEl);
      markDirty();
    });
    hostEl.appendChild(chip);
  }
}

function plainTextFromHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return (tmp.textContent || tmp.innerText || "").trim();
}

function parseQuery(q) {
  const parts = (q || "").trim().split(/\\s+/).filter(Boolean);
  const tags = [];
  const terms = [];
  for (const p of parts) {
    if (p.startsWith("#")) tags.push(normalizeTag(p));
    else terms.push(p.toLowerCase());
  }
  return { tags, terms };
}

function nodeMatches(n, q) {
  if (!q || (!q.tags.length && !q.terms.length)) return true;
  const tags = ensureTags(n);
  // tag logic: all query tags must be present
  for (const t of q.tags) {
    if (!tags.map(normalizeTag).includes(t)) return false;
  }
  if (!q.terms.length) return true;
  const hay = [
    n.data?.title || "",
    n.data?.text || "",
    plainTextFromHtml(n.data?.html || ""),
    n.data?.linkUrl || "",
    tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return q.terms.every((term) => hay.includes(term));
}

function applySearchFilter() {
  const q = parseQuery(currentQuery);
  visibleNodeIds = new Set();
  for (const n of board.nodes) {
    const el = document.getElementById(n.id);
    const match = nodeMatches(n, q);
    if (el) {
      el.style.display = match ? "" : "none";
      el.classList.toggle("dim", !match && currentQuery.length > 0);
    }
    if (match) visibleNodeIds.add(n.id);
  }
  renderEdges();
}

function exportBoard() {
  if (!API_BASE) {
    alert("Export endpoint is not available.");
    return;
  }
  showStatus("Preparing export…", { sticky: true });
  const url = `${API_BASE}/board/export`;
  window.location.href = url;
  setTimeout(() => {
    showStatus("Export initiated. Check your downloads.", { sticky: true });
  }, 500);
}

async function fetchLinkPreview(url) {
  if (!url) return null;
  try {
    const resp = await window.fetch("/api/plugins/papertrail-legacy/link-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json().catch(() => null);
    if (!data || data.error) return null;
    return data;
  } catch (err) {
    console.warn("link preview failed", err);
    return null;
  }
}

function renderLinkCard(preview, href) {
  const title = escapeHtml(preview?.title || href || "Link");
  const desc = escapeHtml(preview?.description || "");
  const site = escapeHtml(preview?.siteName || (href ? new URL(href).hostname : ""));
  const icon = preview?.icon ? `<img class="icon" src="${escapeAttr(preview.icon)}" alt="">` : "";
  const img = preview?.image
    ? `<img class="thumb" src="${escapeAttr(preview.image)}" alt="">`
    : `<div class="thumb"></div>`;
  const safeHref = escapeAttr(href || preview?.url || "#");
  return `
          <a href="${safeHref}" target="_blank" rel="noopener" class="link-card">
            ${img}
            <div class="meta">
              <div class="title">${title}</div>
              ${desc ? `<div class="desc">${desc}</div>` : ""}
              <div class="site">${icon}${site}</div>
            </div>
          </a>
        `;
}

function validateImported(json) {
  if (!json || typeof json !== "object") throw new Error("File is not a JSON object");
  if (!Array.isArray(json.nodes) || !Array.isArray(json.edges))
    throw new Error("Missing nodes/edges arrays");
  // Minimal normalization: ensure required fields exist
  json.id = json.id || "board-1";
  json.title = json.title || "Imported Board";
  json.createdAt = json.createdAt || new Date().toISOString();
  json.updatedAt = new Date().toISOString();
  json.nodes = json.nodes.map((n, i) => ({
    id: n.id || `n_imp_${i}`,
    type: n.type || "text",
    x: Number.isFinite(n.x) ? n.x : 100 + i * 20,
    y: Number.isFinite(n.y) ? n.y : 100 + i * 20,
    w: n.w,
    h: n.h,
    data: n.data || {},
  }));
  json.edges = json.edges
    .filter((e) => e && e.sourceId && e.targetId)
    .map((e, i) => ({
      id: e.id || `e_imp_${i}`,
      sourceId: e.sourceId,
      targetId: e.targetId,
    }));
  return json;
}

// --- Auto-layout (simple layered layout, dagre-like) ---
function buildGraph() {
  const nodes = board.nodes.map((n) => ({ id: n.id }));
  const edges = board.edges.map((e) => ({
    from: e.sourceId,
    to: e.targetId,
  }));
  const adj = new Map();
  const indeg = new Map();
  for (const n of nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
    if (indeg.has(e.to)) indeg.set(e.to, indeg.get(e.to) + 1);
    else indeg.set(e.to, 1);
  }
  return { nodes, edges, adj, indeg };
}

function topoLayers() {
  const { nodes, adj, indeg } = buildGraph();
  const q = [];
  const indegCopy = new Map(indeg);
  for (const n of nodes) if ((indegCopy.get(n.id) || 0) === 0) q.push(n.id);
  const layers = [];
  const placed = new Set();
  // Kahn-like layering: nodes with indegree==0 form layer 0, then peel
  let current = q.slice();
  let visitedCount = 0;
  while (current.length) {
    layers.push(current);
    const next = [];
    for (const id of current) {
      placed.add(id);
      visitedCount++;
      const outs = adj.get(id) || [];
      for (const v of outs) {
        indegCopy.set(v, (indegCopy.get(v) || 0) - 1);
        if (indegCopy.get(v) === 0) next.push(v);
      }
    }
    current = next;
  }
  // Any remaining nodes are in cycles; place them in subsequent layers by a simple BFS from any unplaced
  if (visitedCount < nodes.length) {
    const rest = nodes.map((n) => n.id).filter((id) => !placed.has(id));
    // group into chunks of up to 5 per layer to avoid stacking all in one
    const chunk = 5;
    for (let i = 0; i < rest.length; i += chunk) layers.push(rest.slice(i, i + chunk));
  }
  return layers;
}

function autoLayout(direction = "LR") {
  if (!board.nodes.length) return;
  // Ensure DOM sizes are measured before layout
  renderNodes();
  // Build layered structure
  const layers = topoLayers();
  const layerGap = 180; // distance between layers
  const nodeGap = 80; // distance between nodes within a layer

  // Precompute sizes
  const size = new Map();
  for (const n of board.nodes) {
    const b = nodeBounds(n);
    size.set(n.id, { w: b.w || 240, h: b.h || 100 });
  }

  if (direction === "LR") {
    // Layers progress left-to-right; within each layer, nodes are stacked vertically
    let x = 80;
    for (const layer of layers) {
      // compute max width in this layer
      let maxW = 0;
      for (const id of layer) {
        maxW = Math.max(maxW, size.get(id)?.w || 240);
      }
      // vertical placement centered around the board's current view
      let y = 80;
      for (const id of layer) {
        const n = board.nodes.find((nn) => nn.id === id);
        if (!n) continue;
        const wh = size.get(id) || { w: 240, h: 100 };
        n.x = x;
        n.y = y;
        y += wh.h + nodeGap;
      }
      x += maxW + layerGap;
    }
  } else {
    // TB top-to-bottom
    let y = 80;
    for (const layer of layers) {
      let maxH = 0;
      for (const id of layer) {
        maxH = Math.max(maxH, size.get(id)?.h || 100);
      }
      let x = 80;
      for (const id of layer) {
        const n = board.nodes.find((nn) => nn.id === id);
        if (!n) continue;
        const wh = size.get(id) || { w: 240, h: 100 };
        n.x = x;
        n.y = y;
        x += wh.w + nodeGap;
      }
      y += maxH + layerGap;
    }
  }
  render();
  markDirty();
  setStatus("Auto-layout applied");
}

// Ensure status bar hint is rendered on first load
renderStatusBar();
adjustBoardHeight();

// Toolbar wiring
if (canEdit) {
  const addTextBtn = $("#addText");
  addTextBtn?.addEventListener("click", () =>
    addNode("text", viewCenter(), { text: "New note..." })
  );
  $("#addImage")?.addEventListener("click", () => addNode("image", viewCenter()));
  $("#addLink")?.addEventListener("click", () => addNode("link", viewCenter()));
  $("#connect")?.addEventListener("click", toggleConnectMode);
  document.getElementById("autoLayout")?.addEventListener("click", () => autoLayout("LR"));
  importBtn.onclick = () => importFile.click();
} else {
  ["addText", "addImage", "addLink", "connect", "autoLayout", "importBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute("disabled", "true");
      el.classList.add("button--disabled");
    }
  });
}
exportBtn.onclick = exportBoard;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (connectMode && connectFromId) {
      connectFromId = null;
      hideGhost();
      showStatus("Connect cancelled");
    }
  }
});

boardEl.addEventListener("mousedown", (ev) => {
  if (!ev.target || ev.target === boardEl) {
    if (connectMode && connectFromId) {
      connectFromId = null;
      hideGhost();
      showStatus("Connect cancelled");
    }
  }
});
importFile.addEventListener("change", async (e) => {
  if (!canEdit) {
    importFile.value = "";
    showStatus("You don’t have permission to import boards.", { sticky: true });
    return;
  }
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    if (/\.zip$/i.test(file.name)) {
      if (!API_BASE) {
        throw new Error("Import endpoint unavailable");
      }
      setStatus("Validating bundle…", { sticky: true });
      const validateFd = new FormData();
      validateFd.append("bundle", file, file.name);
      const validateResp = await window.fetch(`${API_BASE}/board/import/validate`, {
        method: "POST",
        body: validateFd,
      });
      const validateJson = await validateResp.json().catch(() => ({}));
      if (!validateResp.ok) {
        throw new Error(validateJson?.error || "Bundle validation failed");
      }

      if (validateJson.hasUploads) {
        showStatus("Bundle contains uploads. Existing files will be replaced.");
      }

      if (validateJson.boardId === board.id) {
        const ok = confirm(
          `You're importing the SAME board (ID: ${validateJson.boardId}). Replace the current board with the imported one?`
        );
        if (!ok) {
          setStatus("Import cancelled.");
          importFile.value = "";
          return;
        }
      }

      setStatus("Importing bundle…", { sticky: true });
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const importFd = new FormData();
      importFd.append("bundle", file, file.name);
      const importResp = await window.fetch(`${API_BASE}/board/import`, {
        method: "POST",
        body: importFd,
      });
      const importJson = await importResp.json().catch(() => ({}));
      if (!importResp.ok) {
        throw new Error(importJson?.error || "Import failed");
      }

      board = normalizeIncomingBoard(importJson.board);
      syncGlobalsFromBoard(board);
      render();
      renderStatusBar();
      applySearchFilter();
      lastSavedJSON = computeSnapshot();
      updateSaveButton();
      setStatus(`Imported ${file.name}`);
    } else {
      const text = await file.text();
      const json = JSON.parse(text);
      const validated = validateImported(json);
      if (validated.id === board.id) {
        const ok = confirm(
          `You're importing the SAME board (ID: ${validated.id}). Replace the current board with the imported one?`
        );
        if (!ok) {
          setStatus("Import cancelled.");
          importFile.value = "";
          return;
        }
      }
      board = validated;
      syncGlobalsFromBoard(board);
      render();
      renderStatusBar();
      applySearchFilter();
      markDirty();
      setStatus(`Imported ${file.name}`);
    }
  } catch (err) {
    console.error(err);
    alert(`Import failed: ${err.message || err}`);
    setStatus("Import failed.");
  } finally {
    importFile.value = "";
  }
});
// Search wiring (debounced + clear)
let searchTimer = null;
const clearSearchBtn = document.getElementById("clearSearch");
const updateClearBtn = () => {
  clearSearchBtn.disabled = !searchInput.value;
};
updateClearBtn();

searchInput.addEventListener("input", (e) => {
  currentQuery = e.target.value || "";
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearchFilter(), 150);
  updateClearBtn();
});

// Allow Esc to clear search without triggering global handlers
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    searchInput.value = "";
    currentQuery = "";
    applySearchFilter();
    updateClearBtn();
    e.stopPropagation();
  }
});

// Clear button
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  currentQuery = "";
  applySearchFilter();
  updateClearBtn();
  searchInput.focus();
});
if (isOwner) {
  const resetButton = document.getElementById("reset");
  if (resetButton) resetButton.addEventListener("click", resetBoard);
} else {
  const resetButton = document.getElementById("reset");
  if (resetButton) resetButton.setAttribute("disabled", "true");
}

function viewCenter() {
  const rect = boardEl.getBoundingClientRect();
  return {
    x: boardEl.scrollLeft + rect.width / 2 - 120,
    y: boardEl.scrollTop + rect.height / 2 - 60,
  };
}

// Settings modal wiring (always visible; non-owners see read-only UI)
(() => {
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.querySelector('[data-modal="papertrail-settings"]');
  const settingsClose = document.getElementById("settingsClose");
  const visibilitySelect = document.getElementById("visibilitySelect");
  const statusSelect = document.getElementById("statusSelect");
  const titleInput = document.getElementById("titleInput");
  const saveMetaBtn = document.getElementById("saveMetaBtn");
  const deleteBoardBtn = document.getElementById("deleteBoardBtn");
  const confirmIdInput = document.getElementById("confirmIdInput");
  const settingsNotice = document.getElementById("settingsNotice");

  if (!settingsModal || !titleInput || !visibilitySelect || !statusSelect || !saveMetaBtn) {
    return;
  }

  function openSettings() {
    if (!settingsModal) return;
    // initialize values from server-globals and from current UI
    titleInput.value =
      window.__globals.boardTitle || document.getElementById("boardName").textContent || "";
    visibilitySelect.value = (window.__globals.boardVisibility || "public").toLowerCase();
    statusSelect.value = (window.__globals.boardStatus || "draft").toLowerCase();
    if (window.ModalRuntime?.open) {
      window.ModalRuntime.open(settingsModal);
    } else {
      settingsModal.hidden = false;
      settingsModal.dataset.modalActive = "true";
    }
  }
  function closeSettings() {
    if (!settingsModal) return;
    if (window.ModalRuntime?.close) {
      window.ModalRuntime.close(settingsModal);
    } else {
      settingsModal.hidden = true;
      settingsModal.dataset.modalActive = "false";
    }
  }
  // Disable controls for non-owners
  if (!isOwner) {
    if (settingsNotice) {
      settingsNotice.hidden = false;
      settingsNotice.style.display = "block";
    }
    titleInput.setAttribute("readonly", "true");
    titleInput.setAttribute("disabled", "true");
    visibilitySelect.setAttribute("disabled", "true");
    statusSelect.setAttribute("disabled", "true");
    saveMetaBtn.setAttribute("disabled", "true");
    if (deleteBoardBtn) {
      deleteBoardBtn.setAttribute("disabled", "true");
      deleteBoardBtn.style.opacity = "0.6";
      deleteBoardBtn.style.cursor = "not-allowed";
    }
  }

  settingsBtn?.addEventListener("click", openSettings);
  settingsClose?.addEventListener("click", (e) => {
    e.preventDefault();
    closeSettings();
  });
  settingsModal?.addEventListener("click", (e) => {
    if (!window.ModalRuntime && e.target?.classList?.contains("modal__backdrop")) {
      closeSettings();
    }
  });
  saveMetaBtn?.addEventListener("click", async () => {
    if (!isOwner) return;
    try {
      const payload = {
        visibility: visibilitySelect.value,
        status: statusSelect.value,
        title: titleInput.value,
      };
      const nextBoard = await persistBoard(payload, "PATCH");
      board = nextBoard;
      syncGlobalsFromBoard(board);
      document.getElementById("boardName").textContent = board.title || "";
      lastSavedJSON = computeSnapshot();
      updateSaveButton();
      render();
      closeSettings();
      showStatus("Settings updated", { ttl: 1500 });
    } catch (e) {
      showStatus(e.message || "Update failed", { sticky: true });
    }
  });

  deleteBoardBtn?.addEventListener("click", async () => {
    if (!isOwner) {
      showStatus("Only the owner can delete this board.", { sticky: true });
      return;
    }
    const confirmId = (confirmIdInput?.value || "").trim();
    if (confirmId !== window.__globals.boardId) {
      alert("Type the exact board id to confirm deletion.");
      return;
    }
    if (!confirm("This will permanently delete the board and its data. Continue?")) {
      return;
    }
    try {
      const resp = await window.fetch(`${BOARD_ENDPOINT}`, { method: "DELETE" });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || "Delete failed");
      }
      showStatus("Board deleted", { ttl: 1200 });
      setTimeout(() => {
        if (PROJECT_ID) {
          window.location.href = `/papertrail/${PROJECT_ID}`;
        } else {
          window.location.reload();
        }
      }, 600);
    } catch (err) {
      showStatus(err?.message || "Delete failed", { sticky: true });
    }
  });
})();
/** end of Info Button */

function toggleConnectMode() {
  if (!canEdit) return;
  connectMode = !connectMode;
  connectFromId = null;
  setConnectMode(connectMode);
}

document.addEventListener("keydown", (e) => {
  const typing = isTypingTarget(e.target);

  if (e.key === "Escape") {
    if (connectMode && connectFromId) {
      connectFromId = null;
      hideGhost();
      showStatus("Connect cancelled");
    }
    return;
  }

  if (!canEdit) return;

  if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault(); // avoid browser back
    removeSelection();
    return;
  }
  if (!typing && e.key.toLowerCase() === "c") {
    toggleConnectMode();
    return;
  }
  if (e.key.toLowerCase() === "l" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    autoLayout("LR");
  }
});

// click blank space to clear selection
boardEl.addEventListener("mousedown", (ev) => {
  if (ev.target === boardEl || ev.target === edgesSvg) {
    hideContextMenu();
    selectedNodeId = null;
    selectedEdgeId = null;
    updateSelections();
  }
});
// Allow dropping a .json file onto the board to import
boardEl.addEventListener("dragover", (e) => {
  if (!canEdit) return;
  e.preventDefault();
});
boardEl.addEventListener("drop", async (e) => {
  if (!canEdit) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.name.toLowerCase().endsWith(".json")) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const validated = validateImported(json);
    board = validated;
    syncGlobalsFromBoard(board);
    render();
    markDirty();
    setStatus(`Imported ${file.name}`);
  } catch (err) {
    console.error(err);
    alert(`Import failed: ${err.message || err}`);
    setStatus("Import failed.");
  }
});

// Load existing board
async function loadBoard() {
  try {
    if (!BOARD_ENDPOINT) throw new Error("Missing board endpoint");
    const resp = await window.fetch(BOARD_ENDPOINT);
    if (!resp.ok) throw new Error(`Failed (${resp.status})`);
    const payload = await resp.json();
    const data = payload.board || payload;
    board = normalizeIncomingBoard(data);
    syncGlobalsFromBoard(board);
    boardNameEl.textContent = board.title || "";
    lastSavedJSON = computeSnapshot();
    updateSaveButton();
    currentQuery = searchInput.value || "";
    applySearchFilter();
    setStatus("Loaded.");
  } catch (e) {
    console.warn("loadBoard failed:", e);
    setStatus("Using current board state.");
  } finally {
    render();
    renderStatusBar();
    adjustBoardHeight();
  }
}

async function saveBoard() {
  if (!saveBtn || !canEdit) return;
  saveBtn.disabled = true;
  setStatus("Saving…");
  try {
    syncDomToModel();
    const nextBoard = await persistBoard(buildSavePayload(), "POST");
    board = nextBoard;
    syncGlobalsFromBoard(board);
    boardNameEl.textContent = board.title || "";
    lastSavedJSON = computeSnapshot();
    updateSaveButton();
    render();
    setStatus("Saved at " + new Date(board.updatedAt).toLocaleTimeString());
  } catch (e) {
    setStatus(e?.message || "Save failed.");
    console.error(e);
  } finally {
    saveBtn.disabled = false;
  }
}

function resetBoard() {
  if (!canEdit) return;
  if (!confirm("Clear all nodes/edges? This will NOT save automatically.")) return;
  const now = new Date().toISOString();
  board = {
    id: board.id || "board-1",
    title: "My Evidence Board",
    nodes: [],
    edges: [],
    createdAt: board.createdAt || now,
    updatedAt: now,
  };
  boardNameEl.textContent = board.title || "";
  render();
  // Mark as dirty so user can decide to Save manually
  markDirty();
  setStatus("Board reset. Click Save to persist.");
}

// Image upload handling
const fileInputEl = document.getElementById("fileInput");
const uploadBtnEl = document.getElementById("uploadImage");

if (uploadBtnEl && fileInputEl) {
  if (canEdit && API_BASE) {
    uploadBtnEl.removeAttribute("disabled");
    uploadBtnEl.title = "Upload image from your device";
    uploadBtnEl.addEventListener("click", () => fileInputEl.click());

    fileInputEl.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const endpoint = `${API_BASE}/board/${board.id}/attachments/upload`;
      try {
        setStatus("Uploading…", { sticky: true });
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        const formData = new FormData();
        formData.append("file", file, file.name);
        const resp = await window.fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data?.error || "Upload failed");
        }
        const attachment = data?.attachment || data;
        const imageUrl = attachment?.url || attachment?.publicUrl;
        if (!imageUrl) {
          throw new Error("Upload response missing URL");
        }
        addNode("image", viewCenter(), {
          imageUrl,
          title: attachment?.name || file.name,
          descHtml: attachment?.meta?.caption || "",
        });
        markDirty();
        setStatus("Uploaded.");
      } catch (err) {
        console.error(err);
        alert(err?.message || "Upload failed");
        setStatus("Upload failed.", { sticky: true });
      } finally {
        fileInputEl.value = "";
      }
    });
  } else {
    uploadBtnEl.setAttribute("disabled", "true");
    uploadBtnEl.title = "Image uploads require edit access.";
  }
}

// End of image upload handling

loadBoard();
