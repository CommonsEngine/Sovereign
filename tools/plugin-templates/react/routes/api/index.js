import express from "express";

export default (ctx = {}) => {
  const router = express.Router();

  router.get("/:id", (req, res) => {
    res.json({
      namespace: "{{NAMESPACE}}",
      params: req.params,
      context: ctx,
    });
  });

  return router;
};
