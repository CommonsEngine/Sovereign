/* eslint-disable import/order */
import crypto from "node:crypto";
import fg from "fast-glob";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CAPABILITY_DEFAULT_VALUE = "allow";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../..");
export const rbacCatalogPath = path.join(repoRoot, "platform/scripts/data/rbac.json");

async function loadJsonSafe(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseRoleAssignment(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    return { role: entry.trim(), value: CAPABILITY_DEFAULT_VALUE };
  }
  if (typeof entry === "object") {
    const role = String(entry.role || entry.key || "").trim();
    if (!role) return null;
    const value =
      typeof entry.value === "string" && entry.value
        ? entry.value.trim()
        : CAPABILITY_DEFAULT_VALUE;
    return { role, value };
  }
  return null;
}

function normalizeDescription(source, capability) {
  if (typeof capability.description === "string" && capability.description.trim().length > 0) {
    return capability.description.trim();
  }
  return `Capability declared by plugin ${source}`;
}

function normalizeAssignments(capability, diagnostics) {
  const entries = Array.isArray(capability.roles) ? capability.roles : [];
  const parsed = entries
    .map((role) => parseRoleAssignment(role))
    .filter((assignment) => assignment && assignment.role);
  if (!parsed.length) {
    diagnostics.push({
      level: "warn",
      message: `Capability ${capability.key} has no role assignments`,
      capability: capability.key,
    });
  }
  return parsed;
}

function normalizeCapability(pluginId, namespace, manifestPath, capability, diagnostics) {
  const key = typeof capability.key === "string" ? capability.key.trim() : "";
  if (!key) {
    diagnostics.push({
      level: "warn",
      message: `Skipping capability with missing key in ${manifestPath}`,
      pluginId,
    });
    return null;
  }

  const description = normalizeDescription(pluginId, capability);
  const scope = typeof capability.scope === "string" ? capability.scope.trim() : null;
  const category = typeof capability.category === "string" ? capability.category.trim() : null;
  const metadata =
    capability.metadata && typeof capability.metadata === "object" ? capability.metadata : null;
  const tags = Array.isArray(capability.tags)
    ? capability.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : undefined;

  const normalized = {
    key,
    description,
    scope,
    category,
    tags,
    metadata,
    source: pluginId,
    namespace,
    manifestPath,
  };
  return normalized;
}

export async function collectPluginCapabilities({ cwd = repoRoot } = {}) {
  const matches = await fg("plugins/*/plugin.json", { cwd, absolute: true });
  const diagnostics = [];
  const capabilities = [];
  const rbac = (await loadJsonSafe(rbacCatalogPath)) || {};
  const roleCatalog = new Set(Array.isArray(rbac.roles) ? rbac.roles.map((role) => role.key) : []);

  for (const manifestPath of matches) {
    let manifest;
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      manifest = JSON.parse(raw);
    } catch (err) {
      diagnostics.push({
        level: "error",
        message: `Failed to parse ${manifestPath}: ${err?.message || err}`,
      });
      continue;
    }

    const pluginId = manifest?.id || path.basename(path.dirname(manifestPath));
    const namespace = manifest?.namespace || path.basename(path.dirname(manifestPath));
    const capabilityList =
      manifest?.sovereign?.userCapabilities || manifest?.userCapabilities || [];
    if (!Array.isArray(capabilityList) || !capabilityList.length) continue;

    for (const cap of capabilityList) {
      if (!cap || typeof cap !== "object") continue;
      const normalized = normalizeCapability(pluginId, namespace, manifestPath, cap, diagnostics);
      if (!normalized) continue;

      const assignments = normalizeAssignments(cap, diagnostics);
      normalized.assignments = assignments;

      for (const assignment of assignments) {
        if (assignment && assignment.role && !roleCatalog.has(assignment.role)) {
          diagnostics.push({
            level: "warn",
            message: `Capability ${normalized.key} references unknown role "${assignment.role}"`,
            capability: normalized.key,
            role: assignment.role,
            pluginId,
          });
        }
      }

      capabilities.push(normalized);
    }
  }

  const signature = computeCapabilitySignature(capabilities);
  return { capabilities, diagnostics, signature };
}

export function computeCapabilitySignature(capabilities) {
  const stable = capabilities
    .map((cap) => ({
      key: cap.key,
      source: cap.source,
      assignments: (cap.assignments || [])
        .map((a) => `${a.role}:${a.value}`)
        .sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => (a.key + a.source).localeCompare(b.key + b.source));

  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function summarizeCapabilityDiff(prev = [], next = []) {
  const prevMap = new Map(prev.map((cap) => [cap.key, cap]));
  const nextMap = new Map(next.map((cap) => [cap.key, cap]));

  const removed = [];
  const added = [];

  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) {
      removed.push(prevMap.get(key));
    }
  }
  for (const key of nextMap.keys()) {
    if (!prevMap.has(key)) {
      added.push(nextMap.get(key));
    }
  }

  return { removed, added };
}

export async function readPreviousCapabilityState(statePath) {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCapabilityState(statePath, state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
}
