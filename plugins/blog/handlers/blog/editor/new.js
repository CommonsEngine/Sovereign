import { getBlogProjectAccess } from "../posts/get.js";

export default async function viewPostCreate(req, res, _, ctx) {
  const { prisma, git, logger, fm: FileManager } = ctx;
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).render("error", {
        code: 401,
        message: "Unauthorized",
        description: "Please sign in to create a post.",
      });
    }

    // Accept either :projectId or :id based on route definition
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad request",
        description: "Missing project id",
      });
    }

    // Verify project exists and belongs to the user
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
        description: "Posts can only be created for Blog projects.",
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
      // Not configured yet
      return res.redirect(302, `/${project.type}/${projectId}/configure`);
    }

    // Ensure git connection (reuse cached manager if available)
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
        logger.error("✗ Git connect failed during post creation:", err);
        return res.redirect(302, `/${project.type}/${projectId}/configure`);
      }
    }

    // Pull latest to avoid conflicts
    try {
      await gm.pullLatest();
    } catch (err) {
      logger.warn("Pull latest failed before creating post:", err?.message || err);
      // continue; we'll still create locally
    }

    // Build filename (allow optional ?title= or ?name= in query)
    const baseFromQuery =
      (typeof req.query?.name === "string" && req.query.name) ||
      (typeof req.query?.title === "string" && req.query.title) ||
      "Untitled Post";
    const slugBase =
      baseFromQuery
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "untitled";

    const now = new Date();
    const nowIso = now.toISOString();
    const fm = new FileManager(gm.getLocalPath(), cfg.contentDir || "");

    const frontmatter =
      `---\n` +
      `title: "${baseFromQuery.replace(/"/g, '\\"') || "Untitled Post"}"\n` +
      `description: ""\n` +
      `pubDate: ${nowIso}\n` +
      `draft: false\n` +
      `tags: []\n` +
      `updatedDate: ${nowIso}\n` +
      `---\n\n` +
      `Write your post here...\n`;

    // Create unique filename
    let attempt = 0;
    let finalFilename = "";
    while (attempt < 50) {
      const suffix = attempt === 0 ? "" : `-${attempt}`;
      const candidate = `${slugBase}${suffix}.md`;
      try {
        finalFilename = await fm.createFile(candidate, frontmatter);
        break; // success
      } catch (err) {
        if (String(err?.message || "").includes("File already exists")) {
          attempt += 1;
          continue;
        }
        throw err; // other fs error
      }
    }
    if (!finalFilename) {
      return res.status(500).render("error", {
        code: 500,
        message: "Oops!",
        description: "Failed to allocate a filename for the new post.",
      });
    }

    // Commit and push the new post (best-effort)
    try {
      await gm.publish(`Create post: ${finalFilename}`);
    } catch (err) {
      logger.warn("Publish failed after creating post:", err?.message || err);
      // non-fatal; proceed to editor
    }

    // Redirect to edit page for the newly created post
    return res.redirect(
      302,
      `/blog/${projectId}/post/${encodeURIComponent(finalFilename)}?edit=true`
    );
  } catch (err) {
    logger.error("✗ Create post flow failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to create a new post",
      error: err?.message || String(err),
    });
  }
}
