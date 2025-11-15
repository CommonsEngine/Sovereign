import express from "express";

export default () => {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.send(`<h1>{{DISPLAY_NAME}}</h1><p>{{DESCRIPTION}}</p>`);
  });

  return router;
};
