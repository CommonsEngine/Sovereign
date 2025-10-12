import { uuid } from "../../utils/id.mjs";
import logger from "../../utils/logger.mjs";
import { flags } from "../../config/flags.mjs";
import prisma from "../../prisma.mjs";

export default async function create(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // feature flags (assume flags object available)
    const allowedTypes = new Set();
    if (flags?.gitcms) allowedTypes.add("blog");
    // add other types conditionally...
    // allowed scopes
    const allowedScopes = new Set(["private", "org", "public"]);

    const raw = req.body || {};
    const name =
      String(raw.name ?? "")
        .trim()
        .slice(0, 120) || "Untitled";
    const desc =
      String(raw.desc ?? "")
        .trim()
        .slice(0, 500) || null;
    const type = String(raw.type ?? "blog").trim();
    const scope = String(raw.scope ?? "private").trim();

    // validate
    if (!allowedScopes.has(scope)) {
      return res.status(400).json({ error: "Invalid project scope" });
    }
    if (!allowedTypes.has(type)) {
      return res.status(400).json({ error: "Project type not allowed" });
    }

    // optional: slugify name and ensure uniqueness (simple example)
    const slugBase = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    let slug = slugBase || uuid("s_");
    // ensure unique slug (within transaction or with unique constraint)
    // Create project + blog in transaction
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          id: uuid("p_"),
          name,
          desc,
          type,
          scope,
          ownerId: userId,
          slug,
        },
        select: {
          id: true,
        },
      });

      if (type === "blog") {
        await tx.blog.create({
          data: {
            id: uuid(),
            projectId: p.id,
            title: name, // use local variable 'name' (not p.name when p was selected limited)
          },
        });
      }

      return p;
    });

    // TODO: Use slug in URL if desired
    const url =
      type === "blog" ? `/p/${project.id}/configure` : `/p/${project.id}`;

    return res.status(201).json({
      ok: true,
      id: project.id,
      url,
    });
  } catch (err) {
    logger.error("Create project failed:", err);
    // handle Prisma unique constraint / validation errors specially if desired
    return res.status(500).json({ error: "Create project failed" });
  }
}
