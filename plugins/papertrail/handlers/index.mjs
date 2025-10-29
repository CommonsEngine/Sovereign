/* eslint-disable import/order */
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import { Readable } from "stream";
import multer from "multer";

import { ensureProjectAccess } from "./_utils.js";

const PAPERTRAIL_DATA_ROOT = path.resolve(
  process.env.PAPERTRAIL_DATA_ROOT || path.join(process.cwd(), "data", "pt")
);

const MAX_UPLOAD_BYTES = Number(process.env.PAPERTRAIL_UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024);
const MAX_IMPORT_BUNDLE_BYTES = Number(process.env.PAPERTRAIL_IMPORT_MAX_BYTES ?? 50 * 1024 * 1024);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const BOARD_WITH_RELATIONS_SELECT = {
  id: true,
  projectId: true,
  title: true,
  schemaVersion: true,
  layout: true,
  meta: true,
  createdAt: true,
  updatedAt: true,
  nodes: {
    select: {
      id: true,
      boardId: true,
      type: true,
      x: true,
      y: true,
      w: true,
      h: true,
      title: true,
      text: true,
      html: true,
      descHtml: true,
      linkUrl: true,
      imageUrl: true,
      meta: true,
      tags: {
        select: {
          tagId: true,
          tag: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
  edges: {
    select: {
      id: true,
      boardId: true,
      sourceId: true,
      targetId: true,
      label: true,
      dashed: true,
      color: true,
    },
  },
  _count: {
    select: {
      nodes: true,
      edges: true,
    },
  },
};

const PROJECT_META_SELECT = {
  id: true,
  name: true,
  desc: true,
  scope: true,
  status: true,
};

async function ensureBoard({ projectId }, { prisma, uuid}) {
  const tx = prisma;
  const board = await tx.papertrailBoard.findUnique({
    where: { projectId },
    select: BOARD_WITH_RELATIONS_SELECT,
  });
  if (board) return board;

  return tx.papertrailBoard.create({
    data: {
      id: uuid("ptb_"),
      projectId,
      title: "Untitled Board",
      schemaVersion: 1,
      meta: {},
    },
    select: BOARD_WITH_RELATIONS_SELECT,
  });
}

async function directoryExists(dirPath) {
  try {
    const stat = await fsPromises.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    const stat = await fsPromises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function clearDirectory(dirPath) {
  try {
    await fsPromises.rm(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function copyDirectory(srcDir, destDir) {
  await fsPromises.mkdir(destDir, { recursive: true });
  const entries = await fsPromises.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

async function withTempDir(prefix, fn) {
  const tempRoot = path.join(PAPERTRAIL_DATA_ROOT, ".tmp");
  await fsPromises.mkdir(tempRoot, { recursive: true });
  const dir = await fsPromises.mkdtemp(path.join(tempRoot, prefix));
  try {
    return await fn(dir);
  } finally {
    try {
      await fsPromises.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

async function findBoardJson(root) {
  const entries = await fsPromises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === "board.json") {
      return path.join(root, entry.name);
    }
  }
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length === 1) {
    const nested = path.join(root, dirs[0].name);
    const candidate = path.join(nested, "board.json");
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function readJsonFile(filePath) {
  const raw = await fsPromises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function extractZipBuffer(buffer, destDir) {
  await fsPromises.mkdir(destDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const extractor = unzipper.Extract({ path: destDir });
    extractor.on("close", resolve);
    extractor.on("error", reject);
    Readable.from(buffer).pipe(extractor);
  });
}

function serializeNode(node) {
  return {
    id: node.id,
    boardId: node.boardId,
    type: node.type,
    x: node.x,
    y: node.y,
    w: node.w ?? null,
    h: node.h ?? null,
    title: node.title ?? null,
    text: node.text ?? null,
    html: node.html ?? null,
    descHtml: node.descHtml ?? null,
    linkUrl: node.linkUrl ?? null,
    imageUrl: node.imageUrl ?? null,
    meta: node.meta ?? {},
    tags: Array.isArray(node.tags)
      ? node.tags
          .map((tagRef) => tagRef.tag?.name ?? null)
          .filter((t) => typeof t === "string" && t.length > 0)
      : [],
  };
}

function serializeEdge(edge) {
  return {
    id: edge.id,
    boardId: edge.boardId,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    label: edge.label ?? null,
    dashed: !!edge.dashed,
    color: edge.color ?? null,
  };
}

function serializeProject(project) {
  if (!project) {
    return {
      id: null,
      name: "",
      desc: "",
      scope: null,
      status: null,
    };
  }
  return {
    id: project.id,
    name: project.name ?? "",
    desc: project.desc ?? "",
    scope: project.scope ?? null,
    status: project.status ?? null,
  };
}

function serializeBoard(board, project) {
  return {
    id: board.id,
    projectId: board.projectId,
    title: board.title ?? "",
    schemaVersion: board.schemaVersion ?? 1,
    layout: board.layout ?? null,
    meta: board.meta ?? {},
    visibility: project?.scope ?? null,
    status: project?.status ?? null,
    createdAtISO:
      board.createdAt instanceof Date ? board.createdAt.toISOString() : (board.createdAt ?? null),
    updatedAtISO:
      board.updatedAt instanceof Date ? board.updatedAt.toISOString() : (board.updatedAt ?? null),
    stats: {
      nodes: board._count?.nodes ?? 0,
      edges: board._count?.edges ?? 0,
    },
    nodes: Array.isArray(board.nodes) ? board.nodes.map((node) => serializeNode(node)) : [],
    edges: Array.isArray(board.edges) ? board.edges.map((edge) => serializeEdge(edge)) : [],
    project: serializeProject(project),
  };
}

function buildBoardExportSnapshot(board, project) {
  const snapshot = serializeBoard(board, project);
  return {
    id: snapshot.id,
    title: snapshot.title,
    schemaVersion: snapshot.schemaVersion,
    layout: snapshot.layout ?? null,
    meta: snapshot.meta ?? {},
    visibility: snapshot.project?.scope ?? null,
    status: snapshot.project?.status ?? null,
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      data: {
        title: node.title ?? null,
        text: node.text ?? null,
        html: node.html ?? null,
        descHtml: node.descHtml ?? null,
        linkUrl: node.linkUrl ?? null,
        imageUrl: node.imageUrl ?? null,
        meta: node.meta ?? {},
        tags: node.tags || [],
      },
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.label ?? null,
      dashed: edge.dashed ?? false,
      color: edge.color ?? null,
    })),
    createdAt: snapshot.createdAtISO || null,
    updatedAt: snapshot.updatedAtISO || null,
  };
}

function sanitizeTagValue(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/^#+/, "").toLowerCase();
  return name || null;
}

function normalizeProjectUpdates(raw = {}) {
  const updates = {};

  if (typeof raw.desc === "string") {
    const desc = raw.desc.trim().slice(0, 500);
    updates.desc = desc || null;
  }

  if (typeof raw.visibility === "string") {
    const visibility = raw.visibility.trim().toLowerCase();
    if (visibility === "private" || visibility === "public") {
      updates.scope = visibility;
    }
  }

  if (typeof raw.scope === "string") {
    const scope = raw.scope.trim().toLowerCase();
    if (scope === "private" || scope === "org" || scope === "public") {
      updates.scope = scope;
    }
  }

  if (typeof raw.status === "string") {
    const status = raw.status.trim().toLowerCase();
    if (status === "draft" || status === "published") {
      updates.status = status;
    }
  }

  return updates;
}

function normalizeBoardPayload(raw = {}, { board }) {
  const sanitized = {};

  if (typeof raw.title === "string") {
    sanitized.title = raw.title.trim().slice(0, 160);
  } else {
    sanitized.title = board.title ?? "Untitled Board";
  }

  if (Object.prototype.hasOwnProperty.call(raw, "layout")) {
    if (raw.layout === null) {
      sanitized.layout = null;
    } else if (typeof raw.layout === "string") {
      sanitized.layout = raw.layout.trim().slice(0, 160);
    }
  } else {
    sanitized.layout = board.layout ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(raw, "meta")) {
    if (raw.meta === null) {
      sanitized.meta = {};
    } else if (typeof raw.meta === "object" && !Array.isArray(raw.meta)) {
      sanitized.meta = raw.meta;
    }
  } else {
    sanitized.meta = board.meta ?? {};
  }

  if (Object.prototype.hasOwnProperty.call(raw, "schemaVersion")) {
    const version = Number(raw.schemaVersion);
    if (Number.isFinite(version)) {
      sanitized.schemaVersion = Math.max(1, Math.trunc(version));
    }
  } else {
    sanitized.schemaVersion = board.schemaVersion ?? 1;
  }

  const nodesInput = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodeMap = new Map();
  const sanitizedNodes = [];
  const allowedTypes = new Set(["text", "image", "link"]);

  for (const maybeNode of nodesInput) {
    if (!maybeNode || typeof maybeNode !== "object") continue;

    const idCandidate = typeof maybeNode.id === "string" ? maybeNode.id.trim() : "";
    const id = idCandidate || uuid("ptn_");

    const typeCandidate =
      typeof maybeNode.type === "string" ? maybeNode.type.trim().toLowerCase() : "text";
    const type = allowedTypes.has(typeCandidate) ? typeCandidate : "text";

    const x = Number(maybeNode.x);
    const y = Number(maybeNode.y);
    const w = Number(maybeNode.w);
    const h = Number(maybeNode.h);

    const data =
      typeof maybeNode.data === "object" && maybeNode.data !== null ? maybeNode.data : {};
    const meta =
      typeof maybeNode.meta === "object" && maybeNode.meta !== null
        ? maybeNode.meta
        : typeof data.meta === "object" && data.meta !== null
          ? data.meta
          : {};

    const tagsRaw = Array.isArray(data.tags) ? data.tags : [];
    const tags = tagsRaw.map((t) => sanitizeTagValue(t)).filter((t) => typeof t === "string");

    const title = typeof data.title === "string" ? data.title.trim().slice(0, 240) : null;
    const text = typeof data.text === "string" ? data.text.trim().slice(0, 4000) : null;
    const html = typeof data.html === "string" ? data.html.trim().slice(0, 10000) : null;
    const descHtml = typeof data.descHtml === "string" ? data.descHtml.trim().slice(0, 8000) : null;
    const linkUrl = typeof data.linkUrl === "string" ? data.linkUrl.trim().slice(0, 2000) : null;
    const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim().slice(0, 2000) : null;

    const nodePayload = {
      id,
      type,
      x: Number.isFinite(x) ? Math.trunc(x) : 0,
      y: Number.isFinite(y) ? Math.trunc(y) : 0,
      w: Number.isFinite(w) ? Math.trunc(w) : null,
      h: Number.isFinite(h) ? Math.trunc(h) : null,
      title,
      text,
      html,
      descHtml,
      linkUrl,
      imageUrl,
      meta,
      tags,
    };

    sanitizedNodes.push(nodePayload);
    nodeMap.set(id, nodePayload);
  }

  const edgesInput = Array.isArray(raw.edges) ? raw.edges : [];
  const sanitizedEdges = [];

  for (const maybeEdge of edgesInput) {
    if (!maybeEdge || typeof maybeEdge !== "object") continue;

    const sourceId = typeof maybeEdge.sourceId === "string" ? maybeEdge.sourceId.trim() : null;
    const targetId = typeof maybeEdge.targetId === "string" ? maybeEdge.targetId.trim() : null;
    if (!sourceId || !targetId) continue;
    if (!nodeMap.has(sourceId) || !nodeMap.has(targetId)) continue;

    const idCandidate = typeof maybeEdge.id === "string" ? maybeEdge.id.trim() : "";
    const id = idCandidate || uuid("pte_");

    const label = typeof maybeEdge.label === "string" ? maybeEdge.label.trim().slice(0, 240) : null;
    const color = typeof maybeEdge.color === "string" ? maybeEdge.color.trim().slice(0, 32) : null;

    sanitizedEdges.push({
      id,
      sourceId,
      targetId,
      label,
      dashed: !!maybeEdge.dashed,
      color,
    });
  }

  sanitized.nodes = sanitizedNodes;
  sanitized.edges = sanitizedEdges;
  sanitized.projectUpdates = normalizeProjectUpdates(raw);

  return sanitized;
}

async function writeBoardSnapshot({ projectId, boardId, payload }) {
  try {
    return prisma.$transaction(async (tx) => {
      const boardUpdate = {
        title: payload.title,
        schemaVersion: payload.schemaVersion ?? 1,
        layout: payload.layout ?? null,
        meta: payload.meta ?? {},
      };

      await tx.papertrailBoard.update({
        where: { id: boardId },
        data: boardUpdate,
      });

      if (payload.projectUpdates && Object.keys(payload.projectUpdates).length) {
        await tx.project.update({
          where: { id: projectId },
          data: payload.projectUpdates,
        });
      }

      await tx.paperTrailEdge.deleteMany({ where: { boardId } });
      await tx.paperTrailNode.deleteMany({ where: { boardId } });

      const tagCache = new Map();

      async function ensureTag(name) {
        if (tagCache.has(name)) return tagCache.get(name);
        const tag = await tx.paperTrailTag.upsert({
          where: { name },
          update: {},
          create: { id: uuid("tag_"), name },
        });
        tagCache.set(name, tag);
        return tag;
      }

      for (const node of payload.nodes) {
        await tx.paperTrailNode.create({
          data: {
            id: node.id,
            boardId,
            type: node.type,
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h,
            title: node.title,
            text: node.text,
            html: node.html,
            descHtml: node.descHtml,
            linkUrl: node.linkUrl,
            imageUrl: node.imageUrl,
            meta: node.meta ?? {},
          },
        });

        for (const tagName of node.tags ?? []) {
          const tag = await ensureTag(tagName);
          await tx.paperTrailNodeTag.create({
            data: { nodeId: node.id, tagId: tag.id },
          });
        }
      }

      for (const edge of payload.edges) {
        await tx.paperTrailEdge.create({
          data: {
            id: edge.id,
            boardId,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            label: edge.label,
            dashed: edge.dashed,
            color: edge.color,
          },
        });
      }

      const [boardRecord, projectRecord] = await Promise.all([
        tx.papertrailBoard.findUnique({
          where: { id: boardId },
          select: BOARD_WITH_RELATIONS_SELECT,
        }),
        tx.project.findUnique({
          where: { id: projectId },
          select: PROJECT_META_SELECT,
        }),
      ]);

      return { board: boardRecord, project: projectRecord };
    });
  } catch (err) {
    logger.error("✗ papertrail writeBoardSnapshot() failed:", err);
  }
}

export async function getBoard(req, res, _, ctx) {
  const {logger} = ctx;
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["viewer"],
      select: {
        ...PROJECT_META_SELECT,
        papertrail: { select: BOARD_WITH_RELATIONS_SELECT },
      },
    }, ctx);

    const board = access.project.papertrail
      ? access.project.papertrail
      : await ensureBoard({ projectId });

    return res.json({
      board: serializeBoard(board, access.project, ctx),
    });
  } catch (err) {
    logger.error("✗ papertrail.getBoard failed:", err);
    return res.status(500).json({ error: "Failed to load papertrail board data" });
  }
}

export async function saveBoard(req, res) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["editor", "owner"],
      select: {
        ...PROJECT_META_SELECT,
        papertrail: { select: BOARD_WITH_RELATIONS_SELECT },
      },
    });

    const boardRecord = access.project.papertrail
      ? access.project.papertrail
      : await ensureBoard({ projectId });

    const payload = normalizeBoardPayload(req.body, { board: boardRecord });

    const { board, project } = await writeBoardSnapshot({
      projectId,
      boardId: boardRecord.id,
      payload,
    });

    return res.json({ board: serializeBoard(board, project) });
  } catch (err) {
    logger.error("✗ papertrail.saveBoard failed:", err);
    return res.status(500).json({ error: "Failed to save papertrail board" });
  }
}

export async function updateBoard(req, res) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["editor", "owner"],
      select: {
        ...PROJECT_META_SELECT,
        papertrail: { select: BOARD_WITH_RELATIONS_SELECT },
      },
    });

    const boardRecord = access.project.papertrail
      ? access.project.papertrail
      : await ensureBoard({ projectId });

    const overrides = normalizeBoardPayload(req.body, { board: boardRecord });

    const boardUpdates = {};
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "title")) {
      boardUpdates.title = overrides.title;
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "layout")) {
      boardUpdates.layout = overrides.layout ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "meta")) {
      boardUpdates.meta = overrides.meta ?? {};
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "schemaVersion")) {
      boardUpdates.schemaVersion = overrides.schemaVersion ?? 1;
    }

    const projectUpdates = normalizeProjectUpdates(req.body);

    if (Object.keys(boardUpdates).length === 0 && Object.keys(projectUpdates).length === 0) {
      return res.status(400).json({ error: "No board fields were provided for update" });
    }

    const { board, project } = await prisma.$transaction(async (tx) => {
      if (Object.keys(boardUpdates).length) {
        await tx.papertrailBoard.update({
          where: { id: boardRecord.id },
          data: boardUpdates,
        });
      }

      if (Object.keys(projectUpdates).length) {
        await tx.project.update({
          where: { id: projectId },
          data: projectUpdates,
        });
      }

      const [updatedBoard, updatedProject] = await Promise.all([
        tx.papertrailBoard.findUnique({
          where: { id: boardRecord.id },
          select: BOARD_WITH_RELATIONS_SELECT,
        }),
        tx.project.findUnique({
          where: { id: projectId },
          select: PROJECT_META_SELECT,
        }),
      ]);

      return { board: updatedBoard, project: updatedProject };
    });

    return res.json({ board: serializeBoard(board, project) });
  } catch (err) {
    logger.error("✗ papertrail.updateBoard failed:", err);
    return res.status(500).json({ error: "Failed to update papertrail board metadata" });
  }
}

export async function exportBoard(req, res) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["viewer"],
      select: {
        ...PROJECT_META_SELECT,
        papertrail: { select: BOARD_WITH_RELATIONS_SELECT },
      },
    });

    const boardRecord = access.project.papertrail
      ? access.project.papertrail
      : await ensureBoard({ projectId });

    const snapshot = buildBoardExportSnapshot(boardRecord, access.project);
    const archive = archiver("zip", { zlib: { level: 9 } });
    const safeTitle = (snapshot.title || "board")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const filename = `${safeTitle || "board"}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    archive.on("error", (err) => {
      logger.error("✗ papertrail.exportBoard archive error", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to export board" });
      } else {
        res.end();
      }
    });

    archive.pipe(res);
    archive.append(JSON.stringify(snapshot, null, 2), { name: "board.json" });

    const uploadsDir = path.join(PAPERTRAIL_DATA_ROOT, boardRecord.id);
    if (await directoryExists(uploadsDir)) {
      archive.directory(uploadsDir, "uploads");
    }

    await archive.finalize();
  } catch (err) {
    logger.error("✗ papertrail.exportBoard failed", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to export board" });
    }
    return res.end();
  }
}

function buildValidationResponse(boardJson) {
  const boardId =
    boardJson && typeof boardJson.id === "string" && boardJson.id.trim()
      ? boardJson.id.trim()
      : "board-1";
  const title = boardJson && typeof boardJson.title === "string" ? boardJson.title : "";
  return { boardId, title };
}

export async function validateImportBundle(req, res) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["editor", "owner"],
    });

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "Bundle file required" });
    }
    if (req.file.size > MAX_IMPORT_BUNDLE_BYTES) {
      return res.status(400).json({ error: "Bundle exceeds maximum allowed size" });
    }

    const info = await withTempDir("pt-validate-", async (tempDir) => {
      await extractZipBuffer(req.file.buffer, tempDir);
      const boardJsonPath = await findBoardJson(tempDir);
      if (!boardJsonPath) {
        throw new HttpError(400, "board.json not found in bundle");
      }
      let parsed;
      try {
        parsed = await readJsonFile(boardJsonPath);
      } catch {
        throw new HttpError(400, "board.json is invalid");
      }

      const uploadsDir = path.join(path.dirname(boardJsonPath), "uploads");
      let hasUploads = false;
      if (await directoryExists(uploadsDir)) {
        const files = await fsPromises.readdir(uploadsDir);
        hasUploads = files.length > 0;
      }

      return {
        ...buildValidationResponse(parsed),
        hasUploads,
      };
    });

    return res.json(info);
  } catch (err) {
    logger.error("✗ papertrail.validateImportBundle failed", err);
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to validate bundle" });
  }
}

export async function importBoard(req, res) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["editor", "owner"],
      select: {
        ...PROJECT_META_SELECT,
        papertrail: { select: BOARD_WITH_RELATIONS_SELECT },
      },
    });

    const boardRecord = access.project.papertrail
      ? access.project.papertrail
      : await ensureBoard({ projectId });

    if (req.file && req.file.buffer) {
      // ZIP import
      if (req.file.size > MAX_IMPORT_BUNDLE_BYTES) {
        return res.status(400).json({ error: "Bundle exceeds maximum allowed size" });
      }

      const result = await withTempDir("pt-import-", async (tempDir) => {
        await extractZipBuffer(req.file.buffer, tempDir);
        const boardJsonPath = await findBoardJson(tempDir);
        if (!boardJsonPath) {
          throw new HttpError(400, "board.json not found in bundle");
        }
        let parsed;
        try {
          parsed = await readJsonFile(boardJsonPath);
        } catch {
          throw new HttpError(400, "board.json is invalid");
        }
        const sanitized = normalizeBoardPayload(parsed, { board: boardRecord });
        const snapshot = await writeBoardSnapshot({
          projectId,
          boardId: boardRecord.id,
          payload: sanitized,
        });
        // Replace uploads directory if provided
        const uploadsSrc = path.join(path.dirname(boardJsonPath), "uploads");
        const uploadsDest = path.join(PAPERTRAIL_DATA_ROOT, boardRecord.id);
        await clearDirectory(uploadsDest);
        await ensureBoardAssetDir(boardRecord.id);
        if (await directoryExists(uploadsSrc)) {
          await copyDirectory(uploadsSrc, uploadsDest);
        }

        await prisma.papertrailAttachment.deleteMany({ where: { projectId } });

        return snapshot;
      });

      return res.json({
        board: serializeBoard(result.board, result.project),
      });
    }

    // JSON payload import
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid board payload" });
    }

    const payload = normalizeBoardPayload(req.body, { board: boardRecord });
    const snapshot = await writeBoardSnapshot({
      projectId,
      boardId: boardRecord.id,
      payload,
    });

    return res.json({
      board: serializeBoard(snapshot.board, snapshot.project),
    });
  } catch (err) {
    logger.error("✗ papertrail.importBoard failed", err);
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to import board" });
  }
}

export async function deleteBoard(req, res) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["owner"],
      select: {
        papertrail: { select: { id: true } },
      },
    });

    const boardRecord = access.project.papertrail;
    if (!boardRecord) {
      return res.status(404).json({ error: "Board not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.paperTrailNodeTag.deleteMany({
        where: { node: { boardId: boardRecord.id } },
      });
      await tx.paperTrailNode.deleteMany({
        where: { boardId: boardRecord.id },
      });
      await tx.paperTrailEdge.deleteMany({
        where: { boardId: boardRecord.id },
      });
      await tx.papertrailAttachment.deleteMany({ where: { projectId } });
      await tx.papertrailBoard.delete({ where: { id: boardRecord.id } });
    });

    const uploadsDir = path.join(PAPERTRAIL_DATA_ROOT, boardRecord.id);
    await clearDirectory(uploadsDir);

    return res.status(204).end();
  } catch (err) {
    logger.error("✗ papertrail.deleteBoard failed", err);
    return res.status(500).json({ error: "Failed to delete board" });
  }
}

async function ensureBoardAssetDir(boardId) {
  const dir = path.join(PAPERTRAIL_DATA_ROOT, boardId);
  await fsPromises.mkdir(dir, { recursive: true });
  return dir;
}

const attachmentStorage = multer.diskStorage({
  destination(req, file, cb) {
    const boardId = req.params.boardId;
    if (!boardId) {
      cb(new Error("Missing board id"));
      return;
    }
    const dest = path.join(PAPERTRAIL_DATA_ROOT, boardId);
    fs.mkdir(dest, { recursive: true }, (err) => cb(err, dest));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${uuid("pta_")}${ext}`);
  },
});

export const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

export async function uploadAttachment(req, res) {
  try {
    const projectId = req.params.id;
    const boardId = req.params.boardId;
    if (!projectId || !boardId) {
      return res.status(400).json({ error: "Missing project or board id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["editor", "owner"],
      select: {
        papertrail: {
          select: { id: true },
        },
      },
    });

    const board = access.project.papertrail
      ? access.project.papertrail
      : await ensureBoard({ projectId });

    if (board.id !== boardId) {
      return res.status(404).json({ error: "Board not found for project" });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    await ensureBoardAssetDir(boardId);

    const relativePath = path.relative(PAPERTRAIL_DATA_ROOT, file.path);
    if (relativePath.startsWith("..")) {
      logger.warn("papertrail.uploadAttachment attempted directory traversal");
      await fsPromises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: "Invalid upload destination" });
    }

    const nodeId = typeof req.body?.nodeId === "string" ? req.body.nodeId.trim() || null : null;

    const targetNodeId = nodeId ?? board.id;

    const normalizedKey = relativePath.replace(/\\+/g, "/");
    const publicUrl = `/uploads/${normalizedKey}`;

    const attachment = await prisma.papertrailAttachment.create({
      data: {
        id: uuid("pta_"),
        projectId,
        nodeId: targetNodeId,
        kind: "file",
        url: publicUrl,
        fileKey: normalizedKey,
        name: file.originalname || null,
        sizeBytes: file.size ?? null,
        meta: {},
      },
      select: {
        id: true,
        nodeId: true,
        kind: true,
        url: true,
        fileKey: true,
        name: true,
        sizeBytes: true,
        meta: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ attachment: { ...attachment, url: publicUrl } });
  } catch (err) {
    logger.error("✗ papertrail.uploadAttachment failed:", err);
    return res.status(500).json({ error: "Failed to upload papertrail attachment" });
  }
}

function notImplemented(req, res) {
  return res.status(501).json({ error: "Not implemented yet" });
}

export const listNodes = notImplemented;
export const createNode = notImplemented;
export const getNode = notImplemented;
export const updateNode = notImplemented;
export const deleteNode = notImplemented;

export const listEdges = notImplemented;
export const createEdge = notImplemented;
export const getEdge = notImplemented;
export const updateEdge = notImplemented;
export const deleteEdge = notImplemented;

export const listComments = notImplemented;
export const createComment = notImplemented;
export const getComment = notImplemented;
export const updateComment = notImplemented;
export const deleteComment = notImplemented;

export const listAttachments = notImplemented;
export const createAttachment = notImplemented;
export const getAttachment = notImplemented;
export const updateAttachment = notImplemented;
export const deleteAttachment = notImplemented;
