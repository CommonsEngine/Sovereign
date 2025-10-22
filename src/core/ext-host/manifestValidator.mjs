import Ajv from "ajv";

const ajv = new Ajv({
  allErrors: true,
  useDefaults: true,
  removeAdditional: false,
  strict: false,
});

const manifestSchema = {
  type: "object",
  additionalProperties: true,
  required: ["name", "version", "sovereign"],
  properties: {
    name: { type: "string", minLength: 1 },
    version: { type: "string", minLength: 1 },
    description: { type: "string" },
    author: { type: "string" },
    license: { type: "string" },
    capabilities: {
      type: "array",
      items: { type: "string", minLength: 1 },
      default: [],
    },
    events: {
      type: "object",
      additionalProperties: false,
      default: { subscribe: [] },
      properties: {
        subscribe: {
          type: "array",
          items: { type: "string", minLength: 1 },
          default: [],
        },
      },
    },
    schema: { type: "string", minLength: 1 },
    migrations: { type: "string", minLength: 1 },
    config: {
      type: "object",
      additionalProperties: {
        anyOf: [
          { type: "string" },
          { type: "number" },
          { type: "boolean" },
          { type: "object" },
          { type: "array" },
          { type: "null" },
        ],
      },
      default: {},
    },
    sovereign: {
      type: "object",
      additionalProperties: true,
      required: ["engine", "entry"],
      properties: {
        engine: { type: "string", minLength: 1 },
        entry: { type: "string", minLength: 1 },
        api: { type: "string", minLength: 1 },
      },
    },
  },
};

const validate = ajv.compile(manifestSchema);

function cloneManifest(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

function formatIssue(error) {
  const path = error.instancePath || error.dataPath || "";
  const keyword = error.keyword;
  const message = error.message || "Invalid value";
  return {
    path: path || "/",
    keyword,
    message,
  };
}

export function validateManifest(manifest, metadata = {}) {
  const cloned = cloneManifest(manifest);
  const valid = validate(cloned);

  if (!valid) {
    const issues = (validate.errors || []).map(formatIssue);
    return {
      success: false,
      manifest: null,
      issues,
      metadata,
    };
  }

  if (!cloned.capabilities) cloned.capabilities = [];
  if (!cloned.events) cloned.events = { subscribe: [] };
  if (!cloned.config) cloned.config = {};

  return {
    success: true,
    manifest: cloned,
    issues: [],
    metadata,
  };
}
