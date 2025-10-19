import { uuid } from "$/utils/id.mjs";
import logger from "$/utils/logger.mjs";
import { flags } from "$/config/flags.mjs";
import prisma from "$/prisma.mjs";

export const MAX_SLUG_ATTEMPTS = 10;

export function slugifyName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export function buildSlug(base, attempt) {
  if (!base) return uuid("s_");
  if (attempt === 0) return base;
  const suffix = attempt === 1 ? uuid("s_").slice(-6) : attempt;
  const candidate = `${base}-${suffix}`;
  return candidate.slice(0, 72) || uuid("s_");
}

export default async function create(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // feature flags (assume flags object available)
    const allowedTypes = new Set();
    if (flags?.blog) allowedTypes.add("blog");
    if (flags?.papertrail) allowedTypes.add("papertrail");
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
    const slugBase = slugifyName(name);

    let createdProject = null;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidateSlug = buildSlug(slugBase, attempt);

      try {
        const result = await prisma.$transaction(async (tx) => {
          const projectRecord = await tx.project.create({
            data: {
              id: uuid("p_"),
              name,
              desc,
              type,
              scope,
              slug: candidateSlug,
            },
            select: {
              id: true,
            },
          });

          await tx.projectContributor.create({
            data: {
              projectId: projectRecord.id,
              userId,
              invitedEmail: req.user?.email
                ? String(req.user.email).trim().toLowerCase()
                : null,
              role: "owner",
              status: "active",
              acceptedAt: new Date(),
            },
          });

          if (type === "blog") {
            await tx.blog.create({
              data: {
                id: uuid(),
                projectId: projectRecord.id,
                title: name,
              },
            });
          }

          if (type === "papertrail") {
            await tx.papertrailBoard.create({
              data: {
                id: uuid("b_"),
                projectId: projectRecord.id,
                title: name,
                schemaVersion: 1, // TODO: remove this line after updating the database schema
                userId,
                meta: {},
              },
            });
          }

          return {
            project: projectRecord,
            slug: candidateSlug,
          };
        });

        createdProject = result;
        break;
      } catch (err) {
        if (err?.code === "P2002") {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (!createdProject) {
      logger.warn("Failed to generate unique project slug", {
        base: slugBase,
        userId,
        error: lastError,
      });
      return res
        .status(409)
        .json({ error: "Unable to generate unique project slug" });
    }

    // TODO: Use slug in URL if desired
    const url =
      type === "blog"
        ? `/p/${createdProject.project.id}/configure`
        : `/p/${createdProject.project.id}`;

    return res.status(201).json({
      ok: true,
      id: createdProject.project.id,
      slug: createdProject.slug,
      url,
    });
  } catch (err) {
    logger.error("Create project failed:", err);
    // handle Prisma unique constraint / validation errors specially if desired
    return res.status(500).json({ error: "Create project failed" });
  }
}
