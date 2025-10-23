import express from "express";
import multer from "multer";

import requireFeature from "$/platform/middlewares/requireFeature.mjs";

import * as handlers from "../handlers/index.mjs";
import { fetchLinkPreview } from "../handlers/link-preview.mjs";

const router = express.Router();

router.use(requireFeature("papertrail"));

const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Board Meta
router.post("/:projectId/board", handlers.saveBoard);
router.get("/:projectId/board", handlers.getBoard);
router.patch("/:projectId/board", handlers.updateBoard);
router.get("/:projectId/board/export", handlers.exportBoard);
router.post(
  "/:projectId/board/import/validate",
  bundleUpload.single("bundle"),
  handlers.validateImportBundle,
);
router.post(
  "/:projectId/board/import",
  bundleUpload.single("bundle"),
  handlers.importBoard,
);
router.delete("/:projectId/board", handlers.deleteBoard);

// Nodes
router.get("/:projectId/board/:boardId/nodes", handlers.listNodes);
router.post("/:projectId/board/:boardId/nodes", handlers.createNode);

router.get("/:projectId/board/:boardId/nodes/:nodeId", handlers.getNode);
router.patch("/:projectId/board/:boardId/nodes/:nodeId", handlers.updateNode);
router.delete("/:projectId/board/:boardId/nodes/:nodeId", handlers.deleteNode);

// Edges
router.get("/:projectId/board/:boardId/edges", handlers.listEdges);
router.post("/:projectId/board/:boardId/edges", handlers.createEdge);

router.get("/:projectId/board/:boardId/edges/:edgeId", handlers.getEdge);
router.patch("/:projectId/board/:boardId/edges/:edgeId", handlers.updateEdge);
router.delete("/:projectId/board/:boardId/edges/:edgeId", handlers.deleteEdge);

// Comments
router.get("/:projectId/board/:boardId/comments", handlers.listComments);
router.post("/:projectId/board/:boardId/comments", handlers.createComment);

router.get(
  "/:projectId/board/:boardId/comments/:commentId",
  handlers.getComment,
);
router.patch(
  "/:projectId/board/:boardId/comments/:commentId",
  handlers.updateComment,
);
router.delete(
  "/:projectId/board/:boardId/comments/:commentId",
  handlers.deleteComment,
);

// Attachments
router.get("/:projectId/board/:boardId/attachments", handlers.listAttachments);
router.post(
  "/:projectId/board/:boardId/attachments",
  handlers.createAttachment,
);

router.get(
  "/:projectId/board/:boardId/attachments/:attachmentId",
  handlers.getAttachment,
);
router.patch(
  "/:projectId/board/:boardId/attachments/:attachmentId",
  handlers.updateAttachment,
);
router.delete(
  "/:projectId/board/:boardId/attachments/:attachmentId",
  handlers.deleteAttachment,
);

router.post(
  "/:projectId/board/:boardId/attachments/upload",
  handlers.attachmentUpload.single("file"),
  handlers.uploadAttachment,
);

router.post("/link-preview", fetchLinkPreview);

export default router;
