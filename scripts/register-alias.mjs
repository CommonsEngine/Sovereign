import { register } from "node:module";

const loaderUrl = new URL("./alias-loader.mjs", import.meta.url);
register(loaderUrl.href);
