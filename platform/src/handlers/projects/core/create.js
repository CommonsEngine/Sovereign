import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";
import { uuid } from "$/utils/id.js";
import env from "$/config/env.js";

const { PROJECTS } = env();

const allowedTypes = new Set(PROJECTS.map((p) => p.value));
const prismaModels = prisma._runtimeDataModel?.models ?? {};

const toModelName = (type) =>
  String(type || "")
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");

const lowerCamel = (str) => (str ? str.charAt(0).toLowerCase() + str.slice(1) : "");

const findModelForType = (type) => {
  const base = toModelName(type);
  const candidates = [base, `${base}Project`, `${base}Board`];
  const modelName = candidates.find((c) => prismaModels[c]);
  if (!modelName) return null;
  return { modelName, delegateName: lowerCamel(modelName) };
};

const buildSubtypeData = ({ modelName, projectId, name }) => {
  const data = { projectId };
  const model = prismaModels[modelName];
  if (!model) return data;

  for (const field of model.fields || []) {
    if (
      field.kind !== "scalar" ||
      field.hasDefaultValue ||
      !field.isRequired ||
      field.name === "projectId" ||
      field.name === "id"
    ) {
      continue;
    }

    if ((field.name === "title" || field.name === "name") && typeof name === "string") {
      data[field.name] = name;
    }
  }

  return data;
};

const createSubtypeRecord = async ({ type, projectId, name }) => {
  const mapping = findModelForType(type);
  if (!mapping) {
    logger.warn?.(`No Prisma model found for project type "${type}", skipping subtype record.`);
    return;
  }

  const delegate = prisma?.[mapping.delegateName];
  if (!delegate?.create) {
    logger.warn?.(
      `No Prisma delegate found for project type "${type}" (delegate "${mapping.delegateName}"), skipping subtype record.`
    );
    return;
  }

  const data = buildSubtypeData({ modelName: mapping.modelName, projectId, name });
  await delegate.create({ data });
};

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
              id: uuid(),
              name,
              desc,
              type,
              scope,
              slug: candidateSlug,
            },
            select: {
              id: true,
              type: true,
            },
          });

          await tx.projectContributor.create({
            data: {
              projectId: projectRecord.id,
              userId,
              invitedEmail: req.user?.email ? String(req.user.email).trim().toLowerCase() : null,
              role: "owner",
              status: "active",
              acceptedAt: new Date(),
            },
          });

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
      return res.status(409).json({ error: "Unable to generate unique project slug" });
    }

    try {
      // TODO: Invoke OnCreate() hook and revise this code later
      await createSubtypeRecord({
        type,
        projectId: createdProject.project.id,
        name,
      });
    } catch (err) {
      logger.error("✗ Failed to create subtype record, rolling back project:", err);
      await prisma.project
        .delete({ where: { id: createdProject.project.id } })
        .catch((cleanupErr) => {
          logger.error("✗ Failed to clean up project after subtype creation error:", cleanupErr);
        });
      throw err;
    }

    const url = `/${type}/${createdProject.project.id}`;

    return res.status(201).json({
      ok: true,
      id: createdProject.project.id,
      slug: createdProject.slug,
      url,
    });
  } catch (err) {
    logger.error("✗ Create project failed:", err);
    // handle Prisma unique constraint / validation errors specially if desired
    return res.status(500).json({ error: "Create project failed" });
  }
}
