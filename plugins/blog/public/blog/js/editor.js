/* eslint-disable no-undef */
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
        })[char]
    );

  const getProjectId = () => {
    if (document.body?.dataset?.projectId) {
      return document.body.dataset.projectId;
    }
    const main = document.querySelector("main[data-project-id]");
    return main?.dataset?.projectId || "";
  };

  const markdownToHtml = (markdown) => {
    if (!markdown) return "";
    const normalized = escapeHtml(String(markdown)).replace(/\r\n/g, "\n");
    const CODE_FENCE = /```([a-z0-9+-]*)\n([\s\S]*?)```/gi;
    const BLOCKQUOTE = /(^|\n)((?:&gt; ?.*(?:\n&gt; ?.*)*))/g;
    const OL = /(^|\n)((?:\d+\.\s+.*(?:\n\d+\.\s+.*)*))/g;
    const UL = /(^|\n)((?:[-*]\s+.*(?:\n[-*]\s+.*)*))/g;

    const codeBlocks = [];
    let html = normalized.replace(CODE_FENCE, (_, language, code) => {
      const lang = String(language || "").trim();
      const clean = String(code || "").replace(/\n$/, "");
      const token = `\u0000CODE${codeBlocks.length}\u0000`;
      const cls = lang ? ` class="language-${lang}"` : "";
      const data = lang ? ` data-lang="${lang}"` : "";
      codeBlocks.push(`<pre><code${cls}${data}>${clean}</code></pre>`);
      return token;
    });

    html = html.replace(/^###### (.*)$/gm, "<h6>$1</h6>");
    html = html.replace(/^##### (.*)$/gm, "<h5>$1</h5>");
    html = html.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
    html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");

    html = html.replace(BLOCKQUOTE, (match, prefix, block) => {
      const body = block
        .split("\n")
        .map((line) => line.replace(/^&gt; ?/, ""))
        .join("<br/>");
      return `${prefix}<blockquote>${body}</blockquote>`;
    });

    const renderList = (prefix, block, tag) => {
      const items = block
        .split("\n")
        .map((line) => line.replace(tag === "ol" ? /^\d+\.\s+/ : /^[-*]\s+/, "").trim())
        .filter(Boolean);
      if (!items.length) return `${prefix}${block}`;
      const content = items.map((item) => `<li>${item}</li>`).join("");
      return `${prefix}<${tag}>${content}</${tag}>`;
    };
    html = html.replace(UL, (match, prefix, block) => renderList(prefix, block, "ul"));
    html = html.replace(OL, (match, prefix, block) => renderList(prefix, block, "ol"));

    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");
    html = html.replace(
      /\[([^\]]+?)\]\(([^)]+?)\)/g,
      '<a href="$2" rel="noopener" target="_blank">$1</a>'
    );

    html = html
      .split(/\n{2,}/)
      .map((block) => {
        const trimmed = block.trim();
        if (
          !trimmed ||
          // eslint-disable-next-line no-control-regex
          /^\u0000CODE\d+\u0000$/.test(trimmed) ||
          /^\s*<(h\d|pre|blockquote|ul|ol)/.test(trimmed)
        ) {
          return trimmed;
        }
        return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
      })
      .filter(Boolean)
      .join("\n")
      // eslint-disable-next-line no-control-regex
      .replace(/\u0000CODE(\d+)\u0000/g, (_, index) => {
        const block = codeBlocks[Number(index)] || "";
        return block;
      });

    return html;
  };

  const htmlToMarkdown = (html) => {
    if (!html) return "";
    const container = document.createElement("div");
    container.innerHTML = html;

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parentTag = node.parentElement?.tagName.toLowerCase();
        if (parentTag === "code" || parentTag === "pre") {
          return node.nodeValue;
        }
        return node.nodeValue.replace(/\s+/g, " ");
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const tag = node.tagName.toLowerCase();
      const childMd = Array.from(node.childNodes).map(walk).join("");

      switch (tag) {
        case "h1":
          return `# ${childMd.trim()}\n\n`;
        case "h2":
          return `## ${childMd.trim()}\n\n`;
        case "h3":
          return `### ${childMd.trim()}\n\n`;
        case "h4":
          return `#### ${childMd.trim()}\n\n`;
        case "h5":
          return `##### ${childMd.trim()}\n\n`;
        case "h6":
          return `###### ${childMd.trim()}\n\n`;
        case "strong":
        case "b":
          return `**${childMd}**`;
        case "em":
        case "i":
          return `*${childMd}*`;
        case "code": {
          const parentTag = node.parentElement?.tagName.toLowerCase();
          if (parentTag === "pre") {
            return childMd;
          }
          return `\`${childMd}\``;
        }
        case "pre": {
          const codeChild = node.querySelector("code");
          const raw = codeChild?.textContent ?? Array.from(node.childNodes).map(walk).join("");
          const lang =
            codeChild?.dataset?.lang ||
            (codeChild?.className.match(/language-([^\s]+)/)?.[1] ?? "");
          const fence = lang ? `\`\`\`${lang}\n` : "```\n";
          return `${fence}${raw}\n\`\`\`\n`;
        }
        case "blockquote": {
          const lines = childMd
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `> ${line}`)
            .join("\n");
          return `${lines}\n\n`;
        }
        case "ul":
          return (
            Array.from(node.children)
              .map((li) => `- ${walk(li).trim()}\n`)
              .join("") + "\n"
          );
        case "ol":
          return (
            Array.from(node.children)
              .map((li, index) => `${index + 1}. ${walk(li).trim()}\n`)
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
          return `${childMd.trim()}\n\n`;
        default:
          return childMd;
      }
    };

    const cleaned = walk(container)
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^[ \t]+>(?=\s?)/gm, ">")
      .trim();

    const normalizeLeadingWhitespace = (markdown) => {
      const lines = markdown.split("\n");
      let inFence = false;
      return lines
        .map((line) => {
          const trimmedStart = line.trimStart();
          if (trimmedStart.startsWith("```")) {
            inFence = !inFence;
            return trimmedStart;
          }
          if (inFence) return line;
          return line.replace(/^[ \t]+/, "");
        })
        .join("\n");
    };

    return normalizeLeadingWhitespace(cleaned);
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
    const coverUrlEl = el("coverUrl");
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

    const contentDir = () => (el("m-dir")?.textContent || "").trim().replace(/^\/+|\/+$/g, "");

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
      tagPreviewEl.textContent = "";
      collectTags().forEach((tag) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = tag;
        tagPreviewEl.appendChild(pill);
      });
    };

    const setDraftState = (draft) => {
      if (draftCheckbox) draftCheckbox.checked = !!draft;
      if (visibilityDraftBtn)
        visibilityDraftBtn.setAttribute("aria-pressed", draft ? "true" : "false");
      if (visibilityPublishedBtn)
        visibilityPublishedBtn.setAttribute("aria-pressed", draft ? "false" : "true");
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

    const rangeIsValid = (range) => {
      if (!range) return false;
      const { startContainer, endContainer } = range;
      if (!startContainer || !endContainer) return false;
      if (!startContainer.isConnected || !endContainer.isConnected) return false;
      if (!rtfEditor.contains(startContainer) || !rtfEditor.contains(endContainer)) return false;
      return true;
    };

    const getOffsetsFromRange = (range) => {
      if (!rangeIsValid(range)) return null;
      const startRange = document.createRange();
      startRange.setStart(rtfEditor, 0);
      startRange.setEnd(range.startContainer, range.startOffset);
      const start = startRange.toString().length;
      const endRange = document.createRange();
      endRange.setStart(rtfEditor, 0);
      endRange.setEnd(range.endContainer, range.endOffset);
      const end = endRange.toString().length;
      startRange.detach?.();
      endRange.detach?.();
      return { start, end };
    };

    const getTextNodeAtOffset = (offset) => {
      let remaining = Math.max(0, offset);
      const walker = document.createTreeWalker(rtfEditor, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      while (node) {
        const len = node.textContent.length;
        if (remaining <= len) {
          return { node, offset: Math.min(remaining, len) };
        }
        remaining -= len;
        node = walker.nextNode();
      }
      return { node: rtfEditor, offset: rtfEditor.childNodes.length };
    };

    let savedRange = null;
    const rememberSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const { startContainer, endContainer } = range;
      if (!rtfEditor.contains(startContainer) || !rtfEditor.contains(endContainer)) {
        return;
      }
      savedRange = range.cloneRange();
    };

    const restoreSelection = () => {
      if (!rangeIsValid(savedRange)) {
        const range = document.createRange();
        range.selectNodeContents(rtfEditor);
        range.collapse(false);
        savedRange = range;
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      rtfEditor.focus();
    };

    const restoreSelectionFromOffsets = (offsets) => {
      if (!offsets) return null;
      const { start, end } = offsets;
      const startPoint = getTextNodeAtOffset(start);
      const endPoint = getTextNodeAtOffset(end);
      const range = document.createRange();
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      savedRange = range.cloneRange();
      return range;
    };

    const surroundSelection = (tagName) => {
      if (!rangeIsValid(savedRange) || savedRange.collapsed) return false;
      const range = savedRange.cloneRange();
      const fragment = range.extractContents();
      const wrapper = document.createElement(tagName);
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
      savedRange = range.cloneRange();
      savedRange.selectNodeContents(wrapper);
      rtfEditor.normalize();
      return true;
    };

    const rebuildRtfFromMarkdown = (offsets) => {
      rtfEditor.innerHTML = markdownToHtml(mdEditor.value);
      if (offsets) {
        restoreSelectionFromOffsets(offsets);
        rememberSelection();
      } else {
        savedRange = null;
        restoreSelection();
      }
    };

    let editorMode = "markdown";
    const updateModeButtons = () => {
      const isMarkdown = editorMode === "markdown";
      mdWrap.hidden = !isMarkdown;
      rtfWrap.hidden = isMarkdown;
      modeMarkdownBtn?.setAttribute("aria-pressed", isMarkdown ? "true" : "false");
      modeRtfBtn?.setAttribute("aria-pressed", !isMarkdown ? "true" : "false");
      modeMarkdownBtn?.classList.toggle("chip--primary", isMarkdown);
      modeRtfBtn?.classList.toggle("chip--primary", !isMarkdown);
    };

    const setMode = (mode) => {
      if (mode === editorMode) return;
      if (mode === "markdown") {
        syncEditors("markdown");
      } else if (mode === "rtf") {
        syncEditors("html");
      }
      editorMode = mode;
      updateModeButtons();
      if (editorMode === "rtf") {
        savedRange = null;
        restoreSelection();
      }
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
        if (typeof meta.description === "string") excerptEl.value = meta.description;
        if (coverUrlEl) {
          coverUrlEl.value = typeof meta.coverUrl === "string" ? meta.coverUrl : "";
        }
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
      const cover = (coverUrlEl?.value || "").trim();
      let pubISO = null;
      if (pubDateEl?.value) {
        try {
          pubISO = new Date(pubDateEl.value).toISOString();
          // eslint-disable-next-line no-empty
        } catch {}
      }
      return {
        projectId: getProjectId(),
        path: toPath(slugEl.value.trim()),
        title: titleEl.value.trim(),
        description: excerptEl.value.trim(),
        coverUrl: cover || null,
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

    try {
      document.execCommand("styleWithCSS", false, false);
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch (err) {
      console.warn("execCommand init failed", err);
    }

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
    visibilityPublishedBtn?.addEventListener("click", () => setDraftState(false));
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

    rtfToolbar?.addEventListener("mousedown", (event) => {
      const btn = event.target.closest("button[data-cmd]");
      if (!btn) return;
      event.preventDefault();
      restoreSelection();
    });

    rtfToolbar?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-cmd]");
      if (!button) return;
      const cmd = button.dataset.cmd;
      let val = button.dataset.value || null;

      if (cmd === "formatBlock" && val && !/^<.+>$/.test(val)) {
        val = `<${val.toLowerCase()}>`;
      }

      if (cmd === "createLink") {
        const url = prompt("Enter URL", "https://");
        if (!url) return;
        val = url;
      }

      restoreSelection();

      try {
        const ok = document.execCommand(cmd, false, val);
        if (!ok && cmd === "insertHTML") {
          const range = savedRange;
          if (range) {
            range.deleteContents();
            const frag = range.createContextualFragment(val || "");
            range.insertNode(frag);
            range.collapse(false);
            savedRange = range.cloneRange();
          }
        } else if (!ok && (cmd === "bold" || cmd === "italic")) {
          surroundSelection(cmd === "bold" ? "strong" : "em");
        }
      } catch (err) {
        console.warn("execCommand failed", cmd, err);
        if (cmd === "bold" || cmd === "italic") {
          surroundSelection(cmd === "bold" ? "strong" : "em");
        }
      }

      rememberSelection();
      const offsets = getOffsetsFromRange(savedRange);
      syncMarkdownFromRtf();
      rebuildRtfFromMarkdown(offsets);
      restoreSelection();
    });

    const syncMarkdownFromRtf = () => {
      mdEditor.value = htmlToMarkdown(rtfEditor.innerHTML);
    };

    rtfEditor.addEventListener("keyup", () => {
      rememberSelection();
      syncMarkdownFromRtf();
    });
    rtfEditor.addEventListener("mouseup", rememberSelection);
    rtfEditor.addEventListener("input", () => {
      rememberSelection();
      syncMarkdownFromRtf();
    });
    rtfEditor.addEventListener("focus", rememberSelection);
    const send = async (method, body) => {
      const projectId = getProjectId();
      const filename = window.__FILENAME__ || "";
      if (!projectId || !filename) throw new Error("Missing identifiers");
      const resp = await window.fetch(
        `/api/plugins/blog/${encodeURIComponent(projectId)}/posts/${encodeURIComponent(filename)}`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify(body),
        }
      );
      if (resp.status === 401) {
        location.href =
          "/login?return_to=" + encodeURIComponent(location.pathname + location.search);
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
      const projectId = getProjectId();
      const filename = window.__FILENAME__ || "";
      if (!projectId || !filename) {
        alert("Missing project or filename.");
        return;
      }
      try {
        const resp = await window.fetch(
          `/api/plugins/blog/${encodeURIComponent(projectId)}/posts/${encodeURIComponent(filename)}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          }
        );
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${resp.status}`);
        }
        location.href = `/blog/${encodeURIComponent(projectId)}`;
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
      console.error("Startup errors", SM.getState(), err);
    }
  });
})();
