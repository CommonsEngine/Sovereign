import fetch from "node-fetch";

import logger from "$/core/services/logger.mjs";

export async function fetchLinkPreview(req, res) {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing url" });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const minimal = (overrides = {}) => ({
      url: parsed.toString(),
      title: parsed.hostname,
      description: "",
      siteName: parsed.hostname,
      image: null,
      icon: new URL("/favicon.ico", parsed).toString(),
      ...overrides,
    });

    const controller = new AbortController();
    const timeoutMs = 8_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let resp;
    try {
      resp = await fetch(parsed.toString(), {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "SovereignPapertrail/1.0 (+https://sovereign.local)",
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err?.name === "AbortError") {
        return res.status(504).json({ error: "Upstream timeout" });
      }
      return res.status(502).json({ error: "Upstream fetch failed" });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp || !resp.ok) {
      return res.status(502).json({
        error: `Upstream error: ${resp ? resp.status : "no-response"}`,
      });
    }

    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) {
      return res.json(minimal());
    }

    let html = "";
    try {
      html = await resp.text();
    } catch {
      return res.json(minimal());
    }

    const pick = (re) => {
      const match = html.match(re);
      return match
        ? (match[1] || match[2] || match[3] || "").toString().trim()
        : "";
    };
    const abs = (input) => {
      if (!input) return null;
      try {
        return new URL(input, parsed).toString();
      } catch {
        return null;
      }
    };

    const ogTitle =
      pick(
        /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      ) ||
      pick(
        /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i,
      );

    const title =
      ogTitle || pick(/<title[^>]*>([^<]*)<\/title>/i) || parsed.hostname;

    const ogDesc =
      pick(
        /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      ) ||
      pick(
        /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      ) ||
      pick(
        /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
      );

    const siteName =
      pick(
        /<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      ) || parsed.hostname;

    const ogImg = pick(
      /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    );

    const iconHref =
      pick(
        /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/i,
      ) ||
      pick(
        /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/i,
      );

    const cleanTitle = String(title || "")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 256);
    const cleanDesc = String(ogDesc || "")
      .replace(/<[^>]*>/g, "")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 512);
    const cleanSite = String(siteName || "")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 128);

    return res.json({
      url: parsed.toString(),
      title: cleanTitle || parsed.hostname,
      description: cleanDesc,
      siteName: cleanSite || parsed.hostname,
      image: abs(ogImg),
      icon: abs(iconHref) || new URL("/favicon.ico", parsed).toString(),
    });
  } catch (err) {
    logger.warn("link preview failed", err);
    return res.status(502).json({ error: "Preview failed" });
  }
}
