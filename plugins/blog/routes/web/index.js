import express from "express";

import getBlog from "./handlers/blog/get.js";

// // import { requireAuth } from "$/platform/middlewares/auth.mjs";
// // import exposeGlobals from "$/platform/middlewares/exposeGlobals.mjs";
// // import requireFeature from "$/platform/middlewares/requireFeature.mjs";

// // import * as indexHandler from "../../handlers/index.mjs";

// const router = express.Router();

// // router.use([requireAuth, exposeGlobals]);

// // router.get("/:projectId/configure", requireFeature("blog"), indexHandler.viewProjectConfigure);
// // router.get("/:projectId/post/new", requireFeature("blog"), indexHandler.viewPostCreate);
// // router.get("/:projectId/post/:fp", requireFeature("blog"), indexHandler.viewPostEdit);

// router.get("/", (req, res) => {
//   res.send("Hello from other side!");
// });

// export default router;

// // Usage with Context
// // export default ({ app, prisma, logger }) => {
// //   const router = express.Router();
// //   router.get("/", async (req, res) => {
// //     const users = await prisma.user.findMany();
// //     res.json(users);
// //   });
// //   return router;
// // };

export default (ctx) => {
  const router = express.Router();

  router.get("/:id", (req, res, next) => {
    return getBlog(req, res, next, ctx);
  });

  router.get("/:id/editor", async (req, res) => {
    res.render("blog/editor");
  });

  router.get("/:id/configure", async (req, res) => {
    res.render("blog/configure");
  });

  return router;
};
