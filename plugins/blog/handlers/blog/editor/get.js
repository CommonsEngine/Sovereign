import { getBlogProjectAccess, parseFrontmatter } from "../posts/get.js";

export default async function viewPostEdit(req, res, _, ctx) {
  const { path, prisma, git, logger, fm: FileManager } = ctx;
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).render("error", {
        code: 401,
        message: "Unauthorized",
        description: "Please sign in to view this post.",
      });
    }

    // Params
    const projectId = req.params.id;
    const rawFilename =
      typeof req.params.postId === "string"
        ? req.params.postId
        : typeof req.params.fp === "string"
          ? req.params.fp
          : "";
    const filename = path.basename(String(rawFilename).trim());
    if (!projectId || !filename || !/\.md$/i.test(filename)) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad request",
        description: "Missing project id or invalid filename.",
      });
    }

    const access = await getBlogProjectAccess(
      req,
      res,
      projectId,
      {
        roles: ["owner", "editor"],
      },
      ctx
    );
    if (!access) return;
    const project = access.project;
    if (project.type !== "blog") {
      return res.status(400).render("error", {
        code: 400,
        message: "Invalid project type",
        description: "Posts are only available for blog projects.",
      });
    }

    // Load Blog config
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
      return res.redirect(302, `/${project.type}/${projectId}/configure`);
    }

    // Ensure git connection
    let gm = git.getGitManager(projectId);
    if (!gm) {
      try {
        gm = await git.getOrInitGitManager(projectId, {
          repoUrl: cfg.repoUrl,
          branch: cfg.branch,
          userName: cfg.userName,
          userEmail: cfg.userEmail,
          authToken: cfg.authSecret || null,
        });
      } catch (err) {
        logger.error("✗ Git connect failed while opening post:", err);
        return res.redirect(302, `/${project.type}/${projectId}/configure`);
      }
    }

    // Pull latest (best effort)
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn("Pull latest failed before opening post:", err?.message || err);
    }

    // Read file contents
    const fm = new FileManager(gm.getLocalPath(), cfg.contentDir || "");
    let raw = "";
    try {
      raw = await fm.readFile(filename);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return res.status(404).render("error", {
          code: 404,
          message: "Not found",
          description: "Post not found",
        });
      }
      if (
        String(err?.message || "")
          .toLowerCase()
          .includes("invalid file path")
      ) {
        return res.status(400).render("error", {
          code: 400,
          message: "Bad request",
          description: "Invalid file path",
        });
      }
      logger.error("✗ Failed to read post:", err);
      return res.status(500).render("error", {
        code: 500,
        message: "Oops!",
        description: "Failed to load post file",
        error: err?.message || String(err),
      });
    }

    const [meta, contentMarkdown] = parseFrontmatter(raw);

    // Render editor template with context
    return res.render("blog/editor", {
      projectId,
      filename,
      projectName: project.name,
      repoUrl: cfg.repoUrl,
      branch: cfg.branch,
      contentDir: cfg.contentDir || "",
      meta,
      contentMarkdown,
      contentRawB64: Buffer.from(raw, "utf8").toString("base64"),
      // convenience fields
      title: meta.title || filename.replace(/\.md$/i, ""),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      tagsCsv: Array.isArray(meta.tags)
        ? meta.tags.join(",")
        : typeof meta.tags === "string"
          ? meta.tags
          : "",
      draft: typeof meta.draft === "boolean" ? meta.draft : true,
      pubDate: meta.date || null,
    });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load post",
      error: err?.message || String(err),
    });
  }
}
