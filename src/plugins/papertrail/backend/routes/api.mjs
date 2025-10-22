import express from "express";
import multer from "multer";

import requireFeature from "../../../../core/middlewares/requireFeature.mjs";
import * as papertrail from "../index.mjs";

const router = express.Router();

// TODO: Move `/projects` prefix to parent router

router.use(requireFeature("papertrail"));

const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Board Meta
router.post("/projects/:projectId/papertrail/board", papertrail.saveBoard);
router.get("/projects/:projectId/papertrail/board", papertrail.getBoard);
router.patch("/projects/:projectId/papertrail/board", papertrail.updateBoard);
router.get(
  "/projects/:projectId/papertrail/board/export",
  papertrail.exportBoard,
);
router.post(
  "/projects/:projectId/papertrail/board/import/validate",
  bundleUpload.single("bundle"),
  papertrail.validateImportBundle,
);
router.post(
  "/projects/:projectId/papertrail/board/import",
  bundleUpload.single("bundle"),
  papertrail.importBoard,
);
router.delete("/projects/:projectId/papertrail/board", papertrail.deleteBoard);

// Nodes
router.get(
  "/projects/:projectId/papertrail/board/:boardId/nodes",
  papertrail.listNodes,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/nodes",
  papertrail.createNode,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  papertrail.getNode,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  papertrail.updateNode,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  papertrail.deleteNode,
);

// Edges
router.get(
  "/projects/:projectId/papertrail/board/:boardId/edges",
  papertrail.listEdges,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/edges",
  papertrail.createEdge,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  papertrail.getEdge,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  papertrail.updateEdge,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  papertrail.deleteEdge,
);

// Comments
router.get(
  "/projects/:projectId/papertrail/board/:boardId/comments",
  papertrail.listComments,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/comments",
  papertrail.createComment,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  papertrail.getComment,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  papertrail.updateComment,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  papertrail.deleteComment,
);

// Attachments
router.get(
  "/projects/:projectId/papertrail/board/:boardId/attachments",
  papertrail.listAttachments,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/attachments",
  papertrail.createAttachment,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  papertrail.getAttachment,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  papertrail.updateAttachment,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  papertrail.deleteAttachment,
);

router.post(
  "/projects/:projectId/papertrail/board/:boardId/attachments/upload",
  papertrail.attachmentUpload.single("file"),
  papertrail.uploadAttachment,
);

export default router;
