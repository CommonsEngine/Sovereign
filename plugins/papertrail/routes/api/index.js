import express from "express";
import multer from "multer";

import * as indexHandler from "../../handlers/index.mjs";
import { fetchLinkPreview } from "../../handlers/link-preview.mjs";

const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export default (ctx) => {
  const router = express.Router();

  router.post("/link-preview", fetchLinkPreview);

  // Board Meta
  router.get("/:projectId/board", (req, res, next) => {
    return indexHandler.getBoard(req, res, next, ctx);
  });
  router.post("/:projectId/board", indexHandler.saveBoard);
  router.patch("/:projectId/board", indexHandler.updateBoard);
  router.get("/:projectId/board/export", indexHandler.exportBoard);
  router.post(
    "/:projectId/board/import/validate",
    bundleUpload.single("bundle"),
    indexHandler.validateImportBundle
  );
  router.post("/:projectId/board/import", bundleUpload.single("bundle"), indexHandler.importBoard);
  router.delete("/:projectId/board", indexHandler.deleteBoard);

  // Nodes
  router.get("/:projectId/board/:boardId/nodes", indexHandler.listNodes);
  router.post("/:projectId/board/:boardId/nodes", indexHandler.createNode);

  router.get("/:projectId/board/:boardId/nodes/:nodeId", indexHandler.getNode);
  router.patch("/:projectId/board/:boardId/nodes/:nodeId", indexHandler.updateNode);
  router.delete("/:projectId/board/:boardId/nodes/:nodeId", indexHandler.deleteNode);

  // Edges
  router.get("/:projectId/board/:boardId/edges", indexHandler.listEdges);
  router.post("/:projectId/board/:boardId/edges", indexHandler.createEdge);

  router.get("/:projectId/board/:boardId/edges/:edgeId", indexHandler.getEdge);
  router.patch("/:projectId/board/:boardId/edges/:edgeId", indexHandler.updateEdge);
  router.delete("/:projectId/board/:boardId/edges/:edgeId", indexHandler.deleteEdge);

  // Comments
  router.get("/:projectId/board/:boardId/comments", indexHandler.listComments);
  router.post("/:projectId/board/:boardId/comments", indexHandler.createComment);

  router.get("/:projectId/board/:boardId/comments/:commentId", indexHandler.getComment);
  router.patch("/:projectId/board/:boardId/comments/:commentId", indexHandler.updateComment);
  router.delete("/:projectId/board/:boardId/comments/:commentId", indexHandler.deleteComment);

  // Attachments
  router.get("/:projectId/board/:boardId/attachments", indexHandler.listAttachments);
  router.post("/:projectId/board/:boardId/attachments", indexHandler.createAttachment);

  router.get("/:projectId/board/:boardId/attachments/:attachmentId", indexHandler.getAttachment);
  router.patch(
    "/:projectId/board/:boardId/attachments/:attachmentId",
    indexHandler.updateAttachment
  );
  router.delete(
    "/:projectId/board/:boardId/attachments/:attachmentId",
    indexHandler.deleteAttachment
  );

  router.post(
    "/:projectId/board/:boardId/attachments/upload",
    indexHandler.attachmentUpload.single("file"),
    indexHandler.uploadAttachment
  );

  return router;
};
