import { createMcpServer } from "./mcp-server.mjs";

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    out[key] = value ?? true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const options = {
  port: args.port ? Number(args.port) : undefined,
  host: args.host,
  storeDir: args.store,
};

const server = await createMcpServer(options);
console.log(
  `[MCP] listening on ${options.host ?? process.env.MCP_HOST ?? "127.0.0.1"}:${options.port ?? process.env.MCP_PORT ?? 4050}`
);

const shutdown = () => {
  console.log("[MCP] shutting down");
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
