import prisma from "$/prisma.mjs";
import logger from "$/utils/logger.mjs";
import { ensureProjectAccess } from "$/utils/projectAccess.mjs";
import { uuid } from "$/utils/id.mjs";

const BOARD_SELECT = {
  id: true,
  projectId: true,
  title: true,
  schemaVersion: true,
  layout: true,
  meta: true,
  userId: true,
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

function serializeNode(node) {
  return {
    id: node.id,
    boardId: node.boardId,
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
    tags: Array.isArray(node.tags)
      ? node.tags.map((tagRef) => ({
          id: tagRef.tagId,
          name: tagRef.tag?.name ?? null,
        }))
      : [],
  };
}

function serializeEdge(edge) {
  return {
    id: edge.id,
    boardId: edge.boardId,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    label: edge.label,
    dashed: !!edge.dashed,
    color: edge.color || null,
  };
}

function serializeBoard(board) {
  if (!board) return null;
  return {
    id: board.id,
    projectId: board.projectId,
    title: board.title,
    schemaVersion: board.schemaVersion,
    layout: board.layout || null,
    meta: board.meta ?? {},
    userId: board.userId ?? null,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    counts: {
      nodes: board._count?.nodes ?? 0,
      edges: board._count?.edges ?? 0,
    },
    nodes: Array.isArray(board.nodes)
      ? board.nodes.map((node) => serializeNode(node))
      : [],
    edges: Array.isArray(board.edges)
      ? board.edges.map((edge) => serializeEdge(edge))
      : [],
  };
}

async function ensureBoard({ project, userId, tx = prisma }) {
  if (!project) return null;
  return tx.papertrailBoard.upsert({
    where: { projectId: project.id },
    create: {
      id: uuid("ptb_"),
      projectId: project.id,
      title: project.name || "Untitled Board",
      schemaVersion: 1,
      userId: userId ?? null,
      meta: {},
    },
    update: {},
    select: BOARD_SELECT,
  });
}

export async function getBoard(req, res) {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["viewer"],
      select: {
        id: true,
        name: true,
        type: true,
        papertrail: { select: BOARD_SELECT },
      },
    });

    if (access.project.type !== "papertrail") {
      return res.status(404).json({ error: "Unsupported project type" });
    }

    let board = access.project.papertrail;
    if (!board) {
      board = await ensureBoard({
        project: access.project,
        userId: req.user?.id,
      });
    }

    return res.json({ board: serializeBoard(board) });
  } catch (err) {
    logger.error("papertrail.getBoard failed:", err);
    return res
      .status(500)
      .json({ error: "Failed to load papertrail board data" });
  }
}

export async function updateBoard(req, res) {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["editor", "owner"],
      select: {
        id: true,
        name: true,
        type: true,
        papertrail: { select: BOARD_SELECT },
      },
    });

    if (access.project.type !== "papertrail") {
      return res.status(404).json({ error: "Unsupported project type" });
    }

    let board = access.project.papertrail;
    if (!board) {
      board = await ensureBoard({
        project: access.project,
        userId: req.user?.id,
      });
    }

    const payload = {};
    const raw = req.body || {};

    if (typeof raw.title === "string") {
      const title = raw.title.trim().slice(0, 120);
      if (title.length === 0) {
        return res.status(400).json({ error: "Board title cannot be empty" });
      }
      payload.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(raw, "layout")) {
      if (
        raw.layout === null ||
        typeof raw.layout === "string" ||
        raw.layout === undefined
      ) {
        payload.layout =
          typeof raw.layout === "string"
            ? raw.layout.trim().slice(0, 120)
            : null;
      } else {
        return res.status(400).json({ error: "Invalid board layout value" });
      }
    }

    if (Object.prototype.hasOwnProperty.call(raw, "schemaVersion")) {
      const sv = Number(raw.schemaVersion);
      if (!Number.isFinite(sv)) {
        return res.status(400).json({ error: "Invalid schema version" });
      }
      payload.schemaVersion = Math.max(1, Math.trunc(sv));
    }

    if (Object.prototype.hasOwnProperty.call(raw, "meta")) {
      if (raw.meta === null) {
        payload.meta = {};
      } else if (typeof raw.meta === "object" && !Array.isArray(raw.meta)) {
        payload.meta = raw.meta;
      } else {
        return res.status(400).json({ error: "Meta must be an object" });
      }
    }

    if (Object.keys(payload).length === 0) {
      return res
        .status(400)
        .json({ error: "No board fields were provided for update" });
    }

    const updated = await prisma.papertrailBoard.update({
      where: { id: board.id },
      data: payload,
      select: BOARD_SELECT,
    });

    return res.json({ board: serializeBoard(updated) });
  } catch (err) {
    logger.error("papertrail.updateBoard failed:", err);
    return res.status(500).json({ error: "Failed to update papertrail board" });
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
