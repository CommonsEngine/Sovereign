import express from "express";

export default (ctx) => {
  const router = express.Router();

  router.get("/", (req, res, next) => {
    return res.send(JSON.stringify(ctx));
  });

  return router;
};
