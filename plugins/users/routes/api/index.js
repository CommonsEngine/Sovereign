import express from "express";

export default (ctx) => {
  const router = express.Router();

  router.patch("/", (req, res, next) => {
    return res.json(ctx);
  });

  return router;
};
