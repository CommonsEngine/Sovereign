import express from "express";

export default () => {
  const router = express.Router();

  router.get("/", (_, res) => {
    return res.render("settings/index");
  });

  return router;
};
