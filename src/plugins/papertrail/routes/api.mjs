import express from "express";
import multer from "multer";

import requireFeature from "$/core/middlewares/requireFeature.mjs";

import * as handlers from "../handlers/index.mjs";

const router = express.Router();

// TODO: Move `/projects` prefix to parent router

router.use(requireFeature("papertrail"));

const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Board Meta
router.post("/projects/:projectId/papertrail/board", handlers.saveBoard);
router.get("/projects/:projectId/papertrail/board", handlers.getBoard);
router.patch("/projects/:projectId/papertrail/board", handlers.updateBoard);
router.get(
  "/projects/:projectId/papertrail/board/export",
  handlers.exportBoard,
);
router.post(
  "/projects/:projectId/papertrail/board/import/validate",
  bundleUpload.single("bundle"),
  handlers.validateImportBundle,
);
router.post(
  "/projects/:projectId/papertrail/board/import",
  bundleUpload.single("bundle"),
  handlers.importBoard,
);
router.delete("/projects/:projectId/papertrail/board", handlers.deleteBoard);

// Nodes
router.get(
  "/projects/:projectId/papertrail/board/:boardId/nodes",
  handlers.listNodes,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/nodes",
  handlers.createNode,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  handlers.getNode,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  handlers.updateNode,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  handlers.deleteNode,
);

// Edges
router.get(
  "/projects/:projectId/papertrail/board/:boardId/edges",
  handlers.listEdges,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/edges",
  handlers.createEdge,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  handlers.getEdge,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  handlers.updateEdge,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  handlers.deleteEdge,
);

// Comments
router.get(
  "/projects/:projectId/papertrail/board/:boardId/comments",
  handlers.listComments,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/comments",
  handlers.createComment,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  handlers.getComment,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  handlers.updateComment,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  handlers.deleteComment,
);

// Attachments
router.get(
  "/projects/:projectId/papertrail/board/:boardId/attachments",
  handlers.listAttachments,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/attachments",
  handlers.createAttachment,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  handlers.getAttachment,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  handlers.updateAttachment,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  handlers.deleteAttachment,
);

router.post(
  "/projects/:projectId/papertrail/board/:boardId/attachments/upload",
  handlers.attachmentUpload.single("file"),
  handlers.uploadAttachment,
);

export default router;
