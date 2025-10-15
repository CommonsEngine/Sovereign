// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { register } from "node:module";

const loaderUrl = new URL("./alias-loader.mjs", import.meta.url);
register(loaderUrl.href);
