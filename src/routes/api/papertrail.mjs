import express from "express";

import * as projectsHandler from "$/handlers/projects/index.mjs";
import requireFeature from "$/middlewares/requireFeature.mjs";

const router = express.Router();

// TODO: Move `/projects` prefix to parent router

router.use(requireFeature("papertrail"));

// Board Meta
router.post(
  "/projects/:projectId/papertrail/board",
  projectsHandler.papertrail.saveBoard,
);
router.get(
  "/projects/:projectId/papertrail/board",
  projectsHandler.papertrail.getBoard,
);
router.patch(
  "/projects/:projectId/papertrail/board",
  projectsHandler.papertrail.updateBoard,
);

// Nodes
router.get(
  "/projects/:projectId/papertrail/board/:boardId/nodes",
  projectsHandler.papertrail.listNodes,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/nodes",
  projectsHandler.papertrail.createNode,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  projectsHandler.papertrail.getNode,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  projectsHandler.papertrail.updateNode,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/nodes/:nodeId",
  projectsHandler.papertrail.deleteNode,
);

// Edges
router.get(
  "/projects/:projectId/papertrail/board/:boardId/edges",
  projectsHandler.papertrail.listEdges,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/edges",
  projectsHandler.papertrail.createEdge,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  projectsHandler.papertrail.getEdge,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  projectsHandler.papertrail.updateEdge,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/edges/:edgeId",
  projectsHandler.papertrail.deleteEdge,
);

// Comments
router.get(
  "/projects/:projectId/papertrail/board/:boardId/comments",
  projectsHandler.papertrail.listComments,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/comments",
  projectsHandler.papertrail.createComment,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  projectsHandler.papertrail.getComment,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  projectsHandler.papertrail.updateComment,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/comments/:commentId",
  projectsHandler.papertrail.deleteComment,
);

// Attachments
router.get(
  "/projects/:projectId/papertrail/board/:boardId/attachments",
  projectsHandler.papertrail.listAttachments,
);
router.post(
  "/projects/:projectId/papertrail/board/:boardId/attachments",
  projectsHandler.papertrail.createAttachment,
);

router.get(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  projectsHandler.papertrail.getAttachment,
);
router.patch(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  projectsHandler.papertrail.updateAttachment,
);
router.delete(
  "/projects/:projectId/papertrail/board/:boardId/attachments/:attachmentId",
  projectsHandler.papertrail.deleteAttachment,
);

router.post(
  "/projects/:projectId/papertrail/board/:boardId/attachments/upload",
  projectsHandler.papertrail.attachmentUpload.single("file"),
  projectsHandler.papertrail.uploadAttachment,
);

export default router;
