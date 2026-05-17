import Ajv from "ajv";
import addFormats from "ajv-formats";

import schema from "../schema/manifest.schema.json";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

export function validateManifest(input: unknown) {
  const valid = validate(input);

  return {
    valid,
    errors: validate.errors ?? [],
  };
}