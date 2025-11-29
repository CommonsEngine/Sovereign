import express from "express";

export default (ctx) => {
  const router = express.Router();

  router.get("/", (req, res) => {
    return res.render("{{NAMESPACE}}/index");
  });

  router.get("/:id", (req, res) => {
    return res.render("{{NAMESPACE}}/[id]");
  });

  return router;
};
