import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";

import schema from "../schema/manifest.schema.json";
import { isSovereignPermission } from "./permissions";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

export function validateManifest(input: unknown) {
  const schemaValid = validate(input);
  const errors: ErrorObject[] = [...(validate.errors ?? [])];

  return {
    valid: schemaValid && validateManifestPermissions(input, errors),
    errors,
  };
}

function validateManifestPermissions(
  input: unknown,
  errors: ErrorObject[]
) {
  if (
    typeof input !== "object" ||
    input === null ||
    !("permissions" in input) ||
    !Array.isArray(input.permissions)
  ) {
    return true;
  }

  let valid = true;

  input.permissions.forEach((permission, index) => {
    if (
      typeof permission !== "string" ||
      isSovereignPermission(permission)
    ) {
      return;
    }

    valid = false;
    errors.push({
      instancePath: `/permissions/${index}`,
      schemaPath: "#/properties/permissions/items",
      keyword: "sovereignPermission",
      params: { permission },
      message: `must be a known Sovereign permission: ${permission}`,
    });
  });

  return valid;
}
