import fs from "node:fs/promises";
import path from "node:path";

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { resolveApp } from "../../../../../../src/launcher";

interface IframeAssetRouteProps {
  params: Promise<{
    appId: string;
    assetPath?: string[];
  }>;
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(_request: Request, { params }: IframeAssetRouteProps) {
  const { appId, assetPath = [] } = await params;
  const app = resolveApp(appId);

  if (!app || !app.runtimeConfig?.entrypoint) {
    notFound();
  }

  const entrypoint = app.runtimeConfig?.entrypoint;

  if (!entrypoint || !isSafeRelativePath(entrypoint)) {
    notFound();
  }

  const repoRoot = getRepoRoot();
  const pluginRoot = path.join(repoRoot, "plugins", app.pluginDirectory);
  const entrypointPath = path.join(pluginRoot, entrypoint);
  const assetRoot = path.dirname(entrypointPath);
  const requestedPath =
    assetPath.length === 0
      ? entrypointPath
      : path.join(assetRoot, ...assetPath);

  if (!isWithinDirectory(assetRoot, requestedPath)) {
    notFound();
  }

  try {
    const body = await fs.readFile(requestedPath);
    const contentType =
      CONTENT_TYPES[path.extname(requestedPath).toLowerCase()] ??
      "application/octet-stream";

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    notFound();
  }
}

function getRepoRoot() {
  return path.basename(process.cwd()) === "platform"
    ? path.dirname(process.cwd())
    : process.cwd();
}

function isSafeRelativePath(input: string) {
  return (
    !path.isAbsolute(input) &&
    !path
      .normalize(input)
      .split(path.sep)
      .some((segment) => segment === "..")
  );
}

function isWithinDirectory(directory: string, candidate: string) {
  const relativePath = path.relative(directory, candidate);

  return relativePath === "" || !relativePath.startsWith("..");
}
