import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../schema/manifest.schema.json";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

export function validateManifest(input: unknown) {
  const valid = validate(input);

  return {
    valid,
    errors: validate.errors ?? [],
  };
}