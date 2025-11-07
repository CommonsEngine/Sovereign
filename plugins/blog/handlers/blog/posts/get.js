import { ensureProjectAccess, ProjectAccessError } from "../_utils.js";

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function makeExcerpt(body, limit = 140) {
  if (!body) return "";
  return (
    String(body)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      // eslint-disable-next-line no-useless-escape
      .replace(/[#>*_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit)
  );
}

export function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function parseFrontmatter(src) {
  const text = String(src || "");
  const match = text.match(FRONTMATTER_REGEX);
  if (!match) return [{}, text];
  const yaml = match[1];
  const body = match[2] || "";
  const meta = {};
  yaml.split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i === -1) return;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (/^(true|false)$/i.test(value)) {
      value = /^true$/i.test(value);
    } else if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const dt = new Date(value);
      if (!Number.isNaN(dt.getTime())) value = dt.toISOString();
    } else if (/^\[.*\]$/.test(value)) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    meta[key] = value;
  });
  return [meta, body];
}

export async function getBlogProjectAccess(req, res, projectId, options = {}, ctx) {
  const {
    roles = ["editor"],
    select = {
      id: true,
      type: true,
      name: true,
      blog: { select: { id: true } },
    },
    responseType = "html",
  } = options;

  try {
    return await ensureProjectAccess(
      {
        projectId,
        user: req.user,
        allowedRoles: roles,
        select,
      },
      ctx
    );
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      const status = err.status ?? 403;
      if (responseType === "json") {
        res.status(status).json({ error: err.message });
      } else {
        const message = status === 404 ? "Not found" : status === 400 ? "Bad request" : "Forbidden";
        const description =
          status === 404
            ? "Project not found"
            : status === 400
              ? err.message || "Invalid request."
              : "You do not have permission to access this project.";
        res.status(status).render("error", {
          code: status,
          message,
          description,
        });
      }
      return null;
    }
    throw err;
  }
}

export default async function getAllPosts(req, res, _, ctx) {
  const { prisma, git, logger, fm: FileManager } = ctx;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // 1) Fetch project id from URL params
    const projectId = req.params?.id;
    if (!projectId) return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const access = await getBlogProjectAccess(
      req,
      res,
      projectId,
      {
        roles: ["viewer"],
        responseType: "json",
      },
      ctx
    );
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).json({ error: "Unsupported project type" });
    }

    // 2) Fetch blog config by project id
    const cfg = await prisma.gitConfig.findUnique({
      where: { projectId },
      select: {
        repoUrl: true,
        branch: true,
        contentDir: true,
        userName: true,
        userEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.status(400).json({ error: "Invalid blog configuration" });
    }

    // 3) Fetch posts using GitManager from repo working directory
    let gm = git.getGitManager(projectId);
    if (!gm) {
      gm = await git.getOrInitGitManager(projectId, {
        repoUrl: cfg.repoUrl,
        branch: cfg.branch,
        userName: cfg.userName,
        userEmail: cfg.userEmail,
        authToken: cfg.authSecret || null,
      });
    }
    // Ensure latest before reading
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn("Failed to pull latest before listing posts:", err?.message || err);
      // continue to read local working tree
    }

    const basePath = gm.getLocalPath();
    const fm = new FileManager(basePath, cfg.contentDir || "");
    const files = await fm.listMarkdownFiles();

    const posts = await Promise.all(
      files.map(async (file) => {
        let raw = "";
        let meta = {};
        let body = "";
        try {
          raw = await fm.readFile(file.filename);
          [meta, body] = parseFrontmatter(raw);
        } catch (err) {
          logger.warn(`Failed to parse frontmatter for ${file.filename}: ${err?.message || err}`);
        }

        const tags = normalizeTags(meta.tags);
        const draft = meta.draft === true;
        const status = draft ? "Draft" : "Published";
        const modifiedISO =
          file.modified instanceof Date ? file.modified.toISOString() : file.modified || "";

        return {
          filename: file.filename,
          title:
            typeof meta.title === "string" && meta.title.trim()
              ? meta.title.trim()
              : file.filename.replace(/\.md$/i, ""),
          description: typeof meta.description === "string" ? meta.description : "",
          tags,
          status,
          draft,
          pubDate: typeof meta.pubDate === "string" ? meta.pubDate : null,
          updatedDate: typeof meta.updatedDate === "string" ? meta.updatedDate : null,
          modified: modifiedISO,
          size: file.size,
          excerpt: makeExcerpt(body),
        };
      })
    );

    return res.status(200).json({ posts });
  } catch (e) {
    logger.error("✗ List blog posts failed:", e);
    return res.status(500).json({ error: "Failed to list posts" });
  }
}
