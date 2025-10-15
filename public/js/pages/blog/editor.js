// ...new file...
(function () {
  const SM = window.StartupManager;
  if (!SM) {
    console.error("StartupManager not loaded");
    return;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200);
  }

  function getContentDir() {
    return (document.getElementById("m-dir")?.textContent || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
  }

  function toPath(slug) {
    const dir = getContentDir();
    const fname = slug ? `${slug}.md` : "untitled.md";
    return dir ? `${dir}/${fname}` : fname;
  }

  function escapeHtml(str) {
    return String(str || "").replace(
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

  function markdownToHtml(md) {
    if (!md) return "";
    let html = md;
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    html = html.replace(
      /```([\s\S]*?)```/g,
      (_, code) => `<pre><code>${code.replace(/\n$/, "")}</code></pre>`,
    );
    html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
    html = html.replace(/^\> (.*)$/gm, "<blockquote>$1</blockquote>");
    html = html.replace(/^(?:\d+\.\s+)(.*)$/gm, "<ol><li>$1</li></ol>");
    html = html.replace(/^(?:-\s+|\*\s+)(.*)$/gm, "<ul><li>$1</li></ul>");
    html = html.replace(/<\/ul>\n<ul>/g, "").replace(/<\/ol>\n<ol>/g, "");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");
    html = html.replace(
      /\[([^\]]+?)\]\(([^)]+?)\)/g,
      '<a href="$2" rel="noopener" target="_blank">$1</a>',
    );
    html = html
      .split(/\n{2,}/)
      .map((blk) =>
        /^\s*<(h\d|pre|blockquote|ul|ol)/.test(blk)
          ? blk
          : `<p>${blk.replace(/\n/g, "<br/>")}</p>`,
      )
      .join("\n");
    return html;
  }

  function htmlToMarkdown(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    const walk = (node) => {
      if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toLowerCase();
      const childMd = Array.from(node.childNodes).map(walk).join("");
      switch (tag) {
        case "h1":
          return `# ${childMd}\n\n`;
        case "h2":
          return `## ${childMd}\n\n`;
        case "h3":
          return `### ${childMd}\n\n`;
        case "strong":
        case "b":
          return `**${childMd}**`;
        case "em":
        case "i":
          return `*${childMd}*`;
        case "code":
          if (
            node.parentElement &&
            node.parentElement.tagName.toLowerCase() === "pre"
          )
            return childMd;
          return "`" + childMd + "`";
        case "pre":
          return "```\n" + childMd + "\n```\n\n";
        case "blockquote":
          return `> ${childMd}\n\n`;
        case "ul":
          return (
            Array.from(node.children)
              .map((li) => `- ${walk(li)}\n`)
              .join("") + "\n"
          );
        case "ol":
          return (
            Array.from(node.children)
              .map((li, i) => `${i + 1}. ${walk(li)}\n`)
              .join("") + "\n"
          );
        case "li":
          return childMd;
        case "a": {
          const href = node.getAttribute("href") || "#";
          return `[${childMd}](${href})`;
        }
        case "br":
          return "  \n";
        case "p":
          return `${childMd}\n\n`;
        default:
          return childMd;
      }
    };
    return walk(div)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  SM.register("editor", async () => {
    const titleEl = $("title");
    const slugEl = $("slug");
    const pathPreviewEl = $("pathPreview");
    const mdWrap = $("md-wrap");
    const mdEditorEl = $("md-editor");
    const mdToolbar = $("md-toolbar");
    const rtfWrap = $("rtf-wrap");
    const editorEl = $("editor");
    const rtToolbar = $("rt-toolbar");
    const excerptEl = $("excerpt");
    const tagsEl = $("tags");
    const tagPreviewEl = $("tag-preview");
    const pubDateEl = $("pubDate");
    const draftEl = $("draft");
    const saveDraftBtn = $("save-draft-btn");
    const publishBtn = $("publish-btn");
    const deleteBtn = $("delete-btn");
    const modeMdBtn = $("mode-md");
    const modeRtfBtn = $("mode-rtf");
    const previewPane = $("preview-pane");
    const previewTimestamp = $("preview-timestamp");
    const previewRefreshBtn = $("preview-refresh");
    const visibilityDraftBtn = $("visibility-draft");
    const visibilityPublishedBtn = $("visibility-published");

    const state = {
      lastPreviewRendered: null,
    };

    if (!mdEditorEl || !titleEl) return { attached: false };

    // helpers inside task
    function updatePathPreview() {
      if (pathPreviewEl && slugEl)
        pathPreviewEl.textContent = toPath(slugEl.value.trim());
    }

    // Selection helpers
    function wrapSelectionInTextarea(textarea, before, after = before) {
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const val = textarea.value;
      const selected = val.slice(start, end);
      const replacement = before + selected + after;
      textarea.value = val.slice(0, start) + replacement + val.slice(end);
      const pos = start + replacement.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    }

    // mode management
    let editorMode = "markdown";
    function updateModeButtons(isMd) {
      modeMdBtn.setAttribute("aria-pressed", isMd ? "true" : "false");
      modeRtfBtn.setAttribute("aria-pressed", isMd ? "false" : "true");
      modeMdBtn.classList.toggle("chip--primary", isMd);
      modeMdBtn.classList.toggle("chip--ghost", !isMd);
      modeRtfBtn.classList.toggle("chip--primary", !isMd);
      modeRtfBtn.classList.toggle("chip--ghost", isMd);
    }
    function setMode(mode) {
      if (mode === editorMode) return;
      if (editorMode === "markdown" && mode === "rtf") {
        editorEl.innerHTML = markdownToHtml(mdEditorEl.value);
      } else if (editorMode === "rtf" && mode === "markdown") {
        mdEditorEl.value = htmlToMarkdown(editorEl.innerHTML);
      }
      editorMode = mode;
      const isMd = editorMode === "markdown";
      mdWrap.hidden = !isMd;
      rtfWrap.hidden = isMd;
      updateModeButtons(isMd);
      markPreviewStale();
      renderPreview();
    }

    // initial slug
    if (slugEl && !slugEl.value) {
      const noExt = (window.__FILENAME__ || "").replace(/\.md$/i, "");
      if (noExt) slugEl.value = noExt;
    }
    updatePathPreview();

    let slugTouched = !!(slugEl && slugEl.value);
    slugEl?.addEventListener("input", () => {
      slugTouched = true;
      updatePathPreview();
    });
    titleEl?.addEventListener("input", () => {
      if (!slugTouched && slugEl) {
        slugEl.value = slugify(titleEl.value);
        updatePathPreview();
      }
    });

    // toolbar listeners
    mdToolbar?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-md]");
      if (!btn) return;
      const cmd = btn.getAttribute("data-md");
      switch (cmd) {
        case "h2":
          wrapSelectionInTextarea(mdEditorEl, "## ", "");
          break;
        case "h3":
          wrapSelectionInTextarea(mdEditorEl, "### ", "");
          break;
        case "bold":
          wrapSelectionInTextarea(mdEditorEl, "**");
          break;
        case "italic":
          wrapSelectionInTextarea(mdEditorEl, "*");
          break;
        case "ul":
          wrapSelectionInTextarea(mdEditorEl, "- ", "");
          break;
        case "ol":
          wrapSelectionInTextarea(mdEditorEl, "1. ", "");
          break;
        case "code":
          wrapSelectionInTextarea(mdEditorEl, "```\n", "\n```");
          break;
        case "quote":
          wrapSelectionInTextarea(mdEditorEl, "> ", "");
          break;
        case "link": {
          const url = prompt("Enter URL");
          if (!url) return;
          wrapSelectionInTextarea(mdEditorEl, "[", `](${url})`);
          break;
        }
        default:
          break;
      }
    });

    document
      .querySelectorAll("#rt-toolbar .editor-btn[data-cmd]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const cmd = btn.getAttribute("data-cmd");
          const val = btn.getAttribute("data-value") || null;
          if (cmd === "insertHTML" && val) {
            document.execCommand("insertHTML", false, val);
          } else if (cmd === "formatBlock") {
            document.execCommand("formatBlock", false, val);
          } else {
            document.execCommand(cmd, false, val);
          }
          editorEl.focus();
        });
      });
    $("clear-btn")?.addEventListener("click", () => {
      editorEl.innerHTML = "";
      editorEl.focus();
    });
    $("link-btn")?.addEventListener("click", () => {
      const url = prompt("Enter URL");
      if (url) document.execCommand("createLink", false, url);
      editorEl.focus();
    });

    if (!mdEditorEl.value || mdEditorEl.value.trim() === "") {
      mdEditorEl.value = htmlToMarkdown(editorEl.innerHTML || "<p></p>");
    }
    updateModeButtons(true);
    setMode("markdown");
    setupEventBindings();
    updateTagPreview();
    renderPreview();
    setDraftState(draftEl?.checked);

    (function initPubDateFromIso() {
      const iso = pubDateEl?.dataset?.iso;
      if (iso) {
        try {
          const d = new Date(iso);
          if (!Number.isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, "0");
            pubDateEl.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
        } catch {}
      }
    })();

    function collectTags() {
      const raw = tagsEl?.value || "";
      return raw
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean);
    }

    function updateTagPreview() {
      if (!tagPreviewEl) return;
      const tags = collectTags();
      if (tags.length === 0) {
        tagPreviewEl.innerHTML = "";
        return;
      }
      tagPreviewEl.innerHTML = tags
        .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`)
        .join(" ");
    }

    function setPreviewStatus(text) {
      if (previewTimestamp) previewTimestamp.textContent = text;
    }

    function markPreviewStale() {
      state.lastPreviewRendered = null;
      setPreviewStatus("Preview out of date");
    }

    function touchPreviewTimestamp() {
      state.lastPreviewRendered = new Date();
      setPreviewStatus(
        `Preview updated ${state.lastPreviewRendered.toLocaleTimeString()}`,
      );
    }

    function renderPreview() {
      if (!previewPane) return;
      const markdown =
        editorMode === "markdown"
          ? mdEditorEl.value
          : htmlToMarkdown(editorEl.innerHTML);
      const html = markdownToHtml(markdown);
      previewPane.innerHTML =
        html || '<p class="help">Start typing to see a rendered preview.</p>';
      touchPreviewTimestamp();
    }

    function setDraftState(isDraft) {
      if (draftEl) {
        draftEl.checked = !!isDraft;
      }
      if (visibilityDraftBtn && visibilityPublishedBtn) {
        visibilityDraftBtn.setAttribute(
          "aria-pressed",
          isDraft ? "true" : "false",
        );
        visibilityPublishedBtn.setAttribute(
          "aria-pressed",
          isDraft ? "false" : "true",
        );
      }
    }

    function collectPayload(overrides = {}) {
      let pubISO = null;
      if (pubDateEl?.value) {
        try {
          pubISO = new Date(pubDateEl.value).toISOString();
        } catch {}
      }
      const projectId = document.body.dataset.projectId || "";
      let contentMarkdown, contentHtml;
      if (editorMode === "markdown") {
        contentMarkdown = mdEditorEl.value;
        contentHtml = markdownToHtml(contentMarkdown);
      } else {
        contentHtml = editorEl.innerHTML;
        contentMarkdown = htmlToMarkdown(contentHtml);
      }
      return {
        projectId,
        path: toPath(slugEl.value.trim()),
        title: titleEl.value.trim(),
        description: excerptEl.value.trim(),
        pubDate: pubISO,
        draft: !!draftEl.checked,
        tags: collectTags(),
        contentHtml,
        contentMarkdown,
        editorMode,
        ...overrides,
      };
    }

    // Save / publish / delete handlers
    saveDraftBtn?.addEventListener("click", async () => {
      const payload = collectPayload();
      const projectId = document.body.dataset.projectId || "";
      const filename = window.__FILENAME__ || "";
      if (!projectId || !filename) {
        alert("Missing project or filename.");
        return;
      }
      const btn = saveDraftBtn;
      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/blog/post/${encodeURIComponent(filename)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "same-origin",
            body: JSON.stringify({ filename, ...payload }),
          },
        );
        if (resp.status === 401) {
          location.href =
            "/login?return_to=" +
            encodeURIComponent(location.pathname + location.search);
          return;
        }
        if (resp.status === 404) {
          alert("Post not found.");
          return;
        }
        const data = await resp.json();
        if (!resp.ok) {
          let msg = `HTTP ${resp.status}`;
          if (data?.error) msg = data.error;
          throw new Error(msg);
        }
        if (resp.status === 200 && data?.renamed) {
          location.href = data?.redirect;
          return;
        }
        renderPreview();
        btn.textContent = "Saved";
        setTimeout(() => (btn.textContent = prevText), 1000);
      } catch (err) {
        console.error("Save draft failed:", err);
        alert(`Failed to save draft: ${err?.message || err}`);
        btn.textContent = prevText;
      } finally {
        btn.disabled = false;
      }
    });

    publishBtn?.addEventListener("click", async () => {
      const projectId = document.body.dataset.projectId || "";
      const filename = window.__FILENAME__ || "";
      if (!projectId || !filename) {
        alert("Missing project or filename.");
        return;
      }
      const btn = publishBtn;
      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Publishing…";
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/blog/post/${encodeURIComponent(filename)}`,
          {
            method: "POST",
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          },
        );
        if (resp.status === 401) {
          location.href =
            "/login?return_to=" +
            encodeURIComponent(location.pathname + location.search);
          return;
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = data?.error || `HTTP ${resp.status}`;
          throw new Error(msg);
        }
        const msg =
          data?.message ||
          (data?.published === false
            ? "No changes to publish."
            : "Published successfully.");
        renderPreview();
        alert(msg);
      } catch (err) {
        console.error("Publish failed:", err);
        alert(`Failed to publish: ${err?.message || err}`);
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });

    function setupEventBindings() {
      tagsEl?.addEventListener("input", updateTagPreview);
      tagsEl?.addEventListener("blur", updateTagPreview);
      previewRefreshBtn?.addEventListener("click", renderPreview);
      visibilityDraftBtn?.addEventListener("click", () => setDraftState(true));
      visibilityPublishedBtn?.addEventListener("click", () =>
        setDraftState(false),
      );
      modeMdBtn?.addEventListener("click", () => setMode("markdown"));
      modeRtfBtn?.addEventListener("click", () => setMode("rtf"));
      mdEditorEl?.addEventListener("input", markPreviewStale);
      editorEl?.addEventListener("input", markPreviewStale);
      excerptEl?.addEventListener("input", () => setPreviewStatus(""));
    }

    deleteBtn?.addEventListener("click", async () => {
      if (!confirm("Delete this post? This cannot be undone.")) return;
      const projectId = document.body.dataset.projectId || "";
      const filename = window.__FILENAME__ || "";
      if (!projectId || !filename) {
        alert("Missing project or filename.");
        return;
      }
      const btn = deleteBtn;
      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Deleting…";
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/blog/post/${encodeURIComponent(filename)}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          },
        );
        if (resp.status === 401) {
          location.href =
            "/login?return_to=" +
            encodeURIComponent(location.pathname + location.search);
          return;
        }
        if (resp.status === 404) {
          alert("Post not found.");
          btn.disabled = false;
          btn.textContent = prevText;
          return;
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = data?.error || `HTTP ${resp.status}`;
          throw new Error(msg);
        }
        location.href = `/p/${encodeURIComponent(projectId)}`;
      } catch (err) {
        console.error("Delete failed:", err);
        alert(`Failed to delete: ${err?.message || err}`);
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });

    // attached
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
