require("dotenv").config();

const bootstrapPath =
  process.env.NODE_ENV === "production" ? "./dist/bootstrap.js" : "./src/bootstrap.js";
require(bootstrapPath).bootstrap();
