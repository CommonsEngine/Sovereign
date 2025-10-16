(function () {
  const SM = window.StartupManager;
  if (!SM) {
    console.error("StartupManager not loaded");
    return;
  }

  const TAG_SEPARATOR = /[\n,]/;

  const el = (id) => document.getElementById(id);
  const slugify = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200);

  const escapeHtml = (str) =>
    String(str || "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );

  const markdownToHtml = (markdown) => {
    if (!markdown) return "";
    let html = escapeHtml(markdown);
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
      .map((block) =>
        /^\s*<(h\d|pre|blockquote|ul|ol)/.test(block)
          ? block
          : `<p>${block.replace(/\n/g, "<br/>")}</p>`,
      )
      .join("\n");
    return html;
  };

  const htmlToMarkdown = (html) => {
    if (!html) return "";
    const container = document.createElement("div");
    container.innerHTML = html;
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
        case "code": {
          const parentTag = node.parentElement?.tagName.toLowerCase();
          if (parentTag === "pre") return childMd;
          return `\`${childMd}\``;
        }
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
              .map((li, index) => `${index + 1}. ${walk(li)}\n`)
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
    return walk(container)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  SM.register("editor", async () => {
    const titleEl = el("title");
    const slugEl = el("slug");
    const pathPreviewEl = el("pathPreview");
    const pageDescEl = el("page-desc");
    const statusBadgeEl = el("status-badge");
    const tagInputEl = el("tags");
    const tagPreviewEl = el("tag-preview");
    const excerptEl = el("excerpt");
    const pubDateEl = el("pubDate");
    const draftCheckbox = el("draft");
    const mdWrap = el("md-wrap");
    const mdEditor = el("md-editor");
    const mdToolbar = el("md-toolbar");
    const rtfWrap = el("rtf-wrap");
    const rtfEditor = el("editor");
    const rtfToolbar = el("rt-toolbar");
    const modeMarkdownBtn = el("mode-md");
    const modeRtfBtn = el("mode-rtf");
    const visibilityDraftBtn = el("visibility-draft");
    const visibilityPublishedBtn = el("visibility-published");
    const saveDraftBtn = el("save-draft-btn");
    const publishBtn = el("publish-btn");
    const deleteBtn = el("delete-btn");
    const fileLabel = el("m-file");

    if (!titleEl || !slugEl || !mdEditor || !rtfEditor) {
      return { attached: false };
    }

    const contentDir = () =>
      (el("m-dir")?.textContent || "").trim().replace(/^\/+|\/+$/g, "");

    const toPath = (slug) => {
      const dir = contentDir();
      const name = slug ? `${slug}.md` : "untitled.md";
      return dir ? `${dir}/${name}` : name;
    };

    const updatePathPreview = () => {
      const path = toPath(slugEl.value.trim());
      if (pathPreviewEl) pathPreviewEl.textContent = path;
      if (pageDescEl) pageDescEl.textContent = path;
    };

    const collectTags = () =>
      (tagInputEl?.value || "")
        .split(TAG_SEPARATOR)
        .map((tag) => tag.trim())
        .filter(Boolean);

    const renderTagChips = () => {
      if (!tagPreviewEl) return;
      tagPreviewEl.innerHTML = collectTags()
        .map((tag) => `<span class="pill">${tag}</span>`)
        .join(" ");
    };

    const setDraftState = (draft) => {
      if (draftCheckbox) draftCheckbox.checked = !!draft;
      if (visibilityDraftBtn)
        visibilityDraftBtn.setAttribute(
          "aria-pressed",
          draft ? "true" : "false",
        );
      if (visibilityPublishedBtn)
        visibilityPublishedBtn.setAttribute(
          "aria-pressed",
          draft ? "false" : "true",
        );
      if (statusBadgeEl) {
        statusBadgeEl.textContent = draft ? "Draft" : "Published";
        statusBadgeEl.classList.toggle("badge--draft", !!draft);
        statusBadgeEl.classList.toggle("badge--published", !draft);
      }
    };

    const isoToLocal = (iso) => {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } catch {
        return "";
      }
    };

    const syncEditors = (targetMode) => {
      if (targetMode === "markdown") {
        mdEditor.value = htmlToMarkdown(rtfEditor.innerHTML);
      } else {
        rtfEditor.innerHTML = markdownToHtml(mdEditor.value);
      }
    };

    let savedRange = null;
    const rememberSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      savedRange = sel.getRangeAt(0);
    };

    const restoreSelection = () => {
      if (!savedRange) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    };

    let editorMode = "markdown";
    const updateModeButtons = () => {
      const isMarkdown = editorMode === "markdown";
      mdWrap.hidden = !isMarkdown;
      rtfWrap.hidden = isMarkdown;
      modeMarkdownBtn?.setAttribute(
        "aria-pressed",
        isMarkdown ? "true" : "false",
      );
      modeRtfBtn?.setAttribute("aria-pressed", !isMarkdown ? "true" : "false");
      modeMarkdownBtn?.classList.toggle("chip--primary", isMarkdown);
      modeRtfBtn?.classList.toggle("chip--primary", !isMarkdown);
    };

    const setMode = (mode) => {
      if (mode === editorMode) return;
      if (mode === "markdown") syncEditors("markdown");
      else syncEditors("html");
      editorMode = mode;
      updateModeButtons();
    };

    const wrapSelection = (textarea, before, after = before) => {
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const value = textarea.value;
      const selected = value.slice(start, end);
      const replacement = `${before}${selected}${after}`;
      textarea.value = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
      const pos = start + replacement.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    };

    const applyServerResponse = (data) => {
      if (!data) return;
      if (data.filename) {
        window.__FILENAME__ = data.filename;
        slugEl.value = data.filename.replace(/\.md$/i, "");
        updatePathPreview();
        if (fileLabel) fileLabel.textContent = data.filename;
      }
      if (data.path && pageDescEl) {
        pageDescEl.textContent = data.path;
        if (pathPreviewEl) pathPreviewEl.textContent = data.path;
      }
      if (data.meta) {
        const meta = data.meta;
        if (typeof meta.title === "string") titleEl.value = meta.title;
        if (typeof meta.description === "string")
          excerptEl.value = meta.description;
        if (Array.isArray(meta.tags)) {
          tagInputEl.value = meta.tags.join(", ");
          renderTagChips();
        }
        if (meta.pubDate) {
          const local = isoToLocal(meta.pubDate);
          if (local) pubDateEl.value = local;
        }
        setDraftState(!!meta.draft);
      }
    };

    const collectPayload = () => {
      if (editorMode === "markdown") syncEditors("html");
      else syncEditors("markdown");
      let pubISO = null;
      if (pubDateEl?.value) {
        try {
          pubISO = new Date(pubDateEl.value).toISOString();
        } catch {}
      }
      return {
        projectId: document.body.dataset.projectId || "",
        path: toPath(slugEl.value.trim()),
        title: titleEl.value.trim(),
        description: excerptEl.value.trim(),
        pubDate: pubISO,
        draft: !!draftCheckbox.checked,
        tags: collectTags(),
        contentMarkdown: mdEditor.value,
        contentHtml: rtfEditor.innerHTML,
        editorMode,
      };
    };

    // initial state
    if (!slugEl.value) {
      const noExt = (window.__FILENAME__ || "").replace(/\.md$/i, "");
      if (noExt) slugEl.value = noExt;
    }
    updatePathPreview();
    renderTagChips();
    setDraftState(draftCheckbox?.checked);
    updateModeButtons();
    syncEditors("html");

    if (pubDateEl?.dataset?.iso && !pubDateEl.value) {
      const local = isoToLocal(pubDateEl.dataset.iso);
      if (local) pubDateEl.value = local;
    }

    // listeners
    tagInputEl?.addEventListener("input", renderTagChips);
    tagInputEl?.addEventListener("blur", renderTagChips);

    let slugTouched = !!slugEl.value;
    slugEl.addEventListener("input", () => {
      slugTouched = true;
      updatePathPreview();
    });
    titleEl.addEventListener("input", () => {
      if (!slugTouched) {
        slugEl.value = slugify(titleEl.value);
        updatePathPreview();
      }
    });

    visibilityDraftBtn?.addEventListener("click", () => setDraftState(true));
    visibilityPublishedBtn?.addEventListener("click", () =>
      setDraftState(false),
    );
    modeMarkdownBtn?.addEventListener("click", () => setMode("markdown"));
    modeRtfBtn?.addEventListener("click", () => setMode("rtf"));

    mdToolbar?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-md]");
      if (!button) return;
      const cmd = button.dataset.md;
      switch (cmd) {
        case "h2":
          wrapSelection(mdEditor, "## ", "");
          break;
        case "h3":
          wrapSelection(mdEditor, "### ", "");
          break;
        case "bold":
          wrapSelection(mdEditor, "**");
          break;
        case "italic":
          wrapSelection(mdEditor, "*");
          break;
        case "ul":
          wrapSelection(mdEditor, "- ", "");
          break;
        case "ol":
          wrapSelection(mdEditor, "1. ", "");
          break;
        case "code":
          wrapSelection(mdEditor, "```\n", "\n```");
          break;
        case "quote":
          wrapSelection(mdEditor, "> ", "");
          break;
        case "link": {
          const url = prompt("Enter URL");
          if (!url) return;
          wrapSelection(mdEditor, "[", `](${url})`);
          break;
        }
        default:
          break;
      }
      syncEditors("html");
    });

    rtfToolbar?.querySelectorAll("button[data-cmd]").forEach((button) => {
      button.addEventListener("click", () => {
        const cmd = button.dataset.cmd;
        const val = button.dataset.value || null;
        restoreSelection();
        document.execCommand(cmd, false, val);
        rememberSelection();
        syncEditors("markdown");
      });
    });

    rtfEditor.addEventListener("keyup", rememberSelection);
    rtfEditor.addEventListener("mouseup", rememberSelection);

    const send = async (method, body) => {
      const projectId = document.body.dataset.projectId || "";
      const filename = window.__FILENAME__ || "";
      if (!projectId || !filename) throw new Error("Missing identifiers");
      const resp = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/blog/post/${encodeURIComponent(filename)}`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify(body),
        },
      );
      if (resp.status === 401) {
        location.href =
          "/login?return_to=" +
          encodeURIComponent(location.pathname + location.search);
        return null;
      }
      if (resp.status === 404) throw new Error("Post not found");
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      return data;
    };

    saveDraftBtn?.addEventListener("click", async () => {
      try {
        const payload = collectPayload();
        const data = await send("PATCH", {
          filename: window.__FILENAME__,
          ...payload,
        });
        applyServerResponse(data);
        alert("Draft saved");
      } catch (err) {
        alert(err?.message || "Failed to save draft");
      }
    });

    publishBtn?.addEventListener("click", async () => {
      try {
        const payload = collectPayload();
        const data = await send("POST", payload);
        applyServerResponse(data);
        alert(data?.message || "Publish complete");
      } catch (err) {
        alert(err?.message || "Failed to publish");
      }
    });

    deleteBtn?.addEventListener("click", async () => {
      if (!confirm("Delete this post? This cannot be undone.")) return;
      const projectId = document.body.dataset.projectId || "";
      const filename = window.__FILENAME__ || "";
      if (!projectId || !filename) {
        alert("Missing project or filename.");
        return;
      }
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/blog/post/${encodeURIComponent(filename)}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          },
        );
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${resp.status}`);
        }
        location.href = `/p/${encodeURIComponent(projectId)}`;
      } catch (err) {
        alert(err?.message || "Failed to delete");
      }
    });

    return { attached: true };
  });

  const wireLoader = () => {
    const spinner = document.querySelector("[data-startup-spinner]");
    SM.onChange((state) => {
      if (!spinner) return;
      spinner.style.display = state.isLoading ? "block" : "none";
    });
  };

  document.addEventListener("DOMContentLoaded", async () => {
    wireLoader();
    try {
      await SM.runAll({ parallel: true });
    } catch (err) {
      console.error("Startup errors", SM.getState());
    }
  });
})();
