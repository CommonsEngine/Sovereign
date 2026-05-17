"use client";

import { useEffect, useRef } from "react";

interface IframeLocalFrameProps {
  appId: string;
  appName: string;
  entrypointFileName: string;
  initialPath: string;
}

interface IframeNavigateMessage {
  type: "sovereign:navigate";
  path: string;
  replace?: boolean;
}

export function IframeLocalFrame({
  appId,
  appName,
  entrypointFileName,
  initialPath,
}: IframeLocalFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const appBasePath = `/apps/${encodeURIComponent(appId)}`;
  const iframeSrc = `/api/apps/${encodeURIComponent(appId)}/iframe/${encodeURIComponent(entrypointFileName)}?sovereignPath=${encodeURIComponent(initialPath)}`;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (!isIframeNavigateMessage(event.data)) {
        return;
      }

      if (!isSafeAppPath(event.data.path)) {
        return;
      }

      const nextUrl = `${appBasePath}${event.data.path === "/" ? "" : event.data.path}`;

      if (event.data.replace) {
        window.history.replaceState(null, "", nextUrl);
      } else {
        window.history.pushState(null, "", nextUrl);
      }
    }

    function handlePopState() {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "sovereign:route",
          path: getCurrentAppPath(appBasePath),
        },
        "*"
      );
    }

    window.addEventListener("message", handleMessage);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [appBasePath]);

  return (
    <iframe
      ref={iframeRef}
      title={appName}
      src={iframeSrc}
      sandbox="allow-forms allow-scripts"
      style={{
        width: "100%",
        minHeight: "720px",
        border: 0,
      }}
    />
  );
}

function getCurrentAppPath(appBasePath: string) {
  const currentPath = window.location.pathname;

  if (!currentPath.startsWith(appBasePath)) {
    return "/";
  }

  const appPath = currentPath.slice(appBasePath.length);

  return isSafeAppPath(appPath) ? appPath || "/" : "/";
}

function isIframeNavigateMessage(
  value: unknown
): value is IframeNavigateMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "sovereign:navigate" &&
    "path" in value &&
    typeof value.path === "string"
  );
}

function isSafeAppPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }

  return !path.split("/").some((segment) => segment === "..");
}
