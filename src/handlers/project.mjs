import prisma from "../prisma.mjs";
import { uuid } from "../utils/id.mjs";
import {
  getGitManager,
  getOrInitGitManager,
} from "../libs/gitcms/registry.mjs";
import FileManager from "../libs/gitcms/fs.mjs";

export async function createProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const allowedTypes = new Set(["gitcms", "papertrail", "workspace"]);
    const allowedScopes = new Set(["private", "org", "public"]);

    const raw = req.body || {};
    const name =
      String(raw.name ?? "")
        .trim()
        .slice(0, 120) || "Untitled";
    const type = allowedTypes.has(String(raw.type))
      ? String(raw.type)
      : "gitcms";
    const scope = allowedScopes.has(String(raw.scope))
      ? String(raw.scope)
      : "private";
    const des = raw.des != null ? String(raw.des).trim().slice(0, 500) : null;

    const project = await prisma.project.create({
      data: {
        id: uuid("p_"),
        name,
        des,
        type,
        scope,
        ownerId: userId,
      },
      select: {
        id: true,
      },
    });
    const url =
      type === "gitcms" ? `/p/${project.id}/configure` : `/p/${project.id}`;
    return res.status(201).json({ ...project, url });
  } catch (e) {
    console.error("Create project failed:", e);
    return res.status(500).json({ error: "Failed to create project" });
  }
}

export async function deleteProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Only the owner can delete
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Cascades will remove subtype records (gitcms/papertrail/workspace) and related rows as defined in schema
    await prisma.project.delete({ where: { id } });

    return res.status(204).end();
  } catch (e) {
    console.error("Delete project failed:", e);
    return res.status(500).json({ error: "Failed to delete project" });
  }
}

export async function updateProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const raw = req.body || {};
    const name =
      typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : undefined;

    if (!name || name.length === 0) {
      return res.status(400).json({ error: "Invalid name" });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });

    return res.status(200).json(updated);
  } catch (e) {
    console.error("Update project failed:", e);
    return res.status(500).json({ error: "Failed to update project" });
  }
}

export async function configureGitCMS(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    // Owner + type check
    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true, type: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (project.type !== "gitcms") {
      return res.status(400).json({ error: "Project is not a GitCMS type" });
    }

    const raw = req.body || {};
    const repoUrl = String(raw.repoUrl || "").trim();
    const defaultBranch = (
      String(raw.defaultBranch || "main").trim() || "main"
    ).slice(0, 80);
    const contentDirRaw =
      typeof raw.contentDir === "string" ? raw.contentDir : "";
    const contentDir = contentDirRaw.trim().slice(0, 200) || null;

    const gitUserName =
      typeof raw.gitUserName === "string"
        ? raw.gitUserName.trim().slice(0, 120)
        : null;
    const gitUserEmail =
      typeof raw.gitUserEmail === "string"
        ? raw.gitUserEmail.trim().slice(0, 120)
        : null;
    const gitAuthToken =
      typeof raw.gitAuthToken === "string" ? raw.gitAuthToken.trim() : null;

    if (!repoUrl)
      return res.status(400).json({ error: "Repository URL is required" });

    // 1) Validate by connecting once and prime the in-memory connection
    try {
      await getOrInitGitManager(id, {
        repoUrl,
        defaultBranch,
        gitUserName,
        gitUserEmail,
        gitAuthToken,
      });
    } catch (err) {
      console.error("Git connect/validate failed:", err);
      return res.status(400).json({
        error:
          "Failed to connect to repository. Please verify the repo URL, branch, and access token.",
      });
    }

    // 2) Persist config only after successful validation
    const config = await prisma.projectGitCMS.upsert({
      where: { projectId: id },
      update: {
        repoUrl,
        defaultBranch,
        contentDir,
        gitUserName,
        gitUserEmail,
        ...(gitAuthToken
          ? { authSecret: gitAuthToken, authType: "token" }
          : {}),
      },
      create: {
        projectId: id,
        repoUrl,
        defaultBranch,
        contentDir,
        gitUserName,
        gitUserEmail,
        ...(gitAuthToken
          ? { authSecret: gitAuthToken, authType: "token" }
          : {}),
      },
      select: {
        projectId: true,
        repoUrl: true,
        defaultBranch: true,
        contentDir: true,
        gitUserName: true,
        gitUserEmail: true,
      },
    });

    return res.status(200).json({ configured: true, gitcms: config });
  } catch (e) {
    console.error("Configure GitCMS failed:", e);
    return res.status(500).json({ error: "Failed to save configuration" });
  }
}

export async function listGitCMSPosts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // 1) Fetch project id from URL params
    const id = req.params?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    // Verify ownership and type
    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true, type: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (project.type !== "gitcms") {
      return res.status(400).json({ error: "Project is not a GitCMS type" });
    }

    // 2) Fetch gitcms config by project id
    const cfg = await prisma.projectGitCMS.findUnique({
      where: { projectId: id },
      select: {
        repoUrl: true,
        defaultBranch: true,
        contentDir: true,
        gitUserName: true,
        gitUserEmail: true,
        authSecret: true,
      },
    });
    if (!cfg) {
      return res.status(400).json({ error: "GitCMS not configured" });
    }

    // 3) Fetch posts using GitManager from repo working directory
    let gm = getGitManager(id);
    if (!gm) {
      gm = await getOrInitGitManager(id, {
        repoUrl: cfg.repoUrl,
        defaultBranch: cfg.defaultBranch,
        gitUserName: cfg.gitUserName,
        gitUserEmail: cfg.gitUserEmail,
        gitAuthToken: cfg.authSecret || null,
      });
    }
    // Ensure latest before reading
    try {
      await gm.pullLatest();
    } catch (err) {
      console.warn(
        "Failed to pull latest before listing posts:",
        err?.message || err,
      );
      // continue to read local working tree
    }

    const basePath = gm.getLocalPath();
    const fm = new FileManager(basePath, cfg.contentDir || "");
    const posts = await fm.listMarkdownFiles();

    return res.status(200).json({ posts });
  } catch (e) {
    console.error("List GitCMS posts failed:", e);
    return res.status(500).json({ error: "Failed to list posts" });
  }
}
