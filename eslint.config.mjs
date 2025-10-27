import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import globals from "globals";
import pluginImport from "eslint-plugin-import";
import pluginN from "eslint-plugin-n";
import pluginPromise from "eslint-plugin-promise";
import eslintConfigPrettier from "eslint-config-prettier";

const nodeFiles = ["**/*.js", "**/*.mjs", "**/*.cjs"];
const nodeLanguageOptions = {
  ecmaVersion: 2023,
  sourceType: "module",
  globals: {
    ...globals.node,
  },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_SRC_PATH = path.resolve(__dirname, "platform/src");

export default [
  {
    ignores: [
      "**/node_modules/**",
      "public/**",
      "data/**",
      "dist/**",
      "tests/**",
      "prisma/data/**",
      "prisma/migrations/**",
      "prisma/schema.prisma",
      "prisma/reset.sh",
      "eslint.config.mjs",
      "package-lock.json",
    ],
  },
  js.configs.recommended,
  pluginImport.flatConfigs.recommended,
  pluginN.configs["flat/recommended"],
  pluginPromise.configs["flat/recommended"],
  eslintConfigPrettier,
  {
    files: nodeFiles,
    languageOptions: nodeLanguageOptions,
    settings: {
      "import/internal-regex": "^\\$/",
    },
    rules: {
      "import/no-unresolved": [
        "error",
        {
          ignore: ["^\\$/"],
        },
      ],
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          "newlines-between": "always",
        },
      ],
      "n/no-missing-import": [
        "error",
        {
          tryExtensions: [".js", ".mjs", ".cjs", ".json"],
          resolverConfig: {
            alias: [
              {
                name: "$",
                alias: PLATFORM_SRC_PATH,
                onlyModule: false,
              },
            ],
          },
        },
      ],
      "n/no-process-exit": "off",
      "import/no-unresolved": "off", // TODO: Make this for some specific files
      "n/no-extraneous-import": "off", // TODO: Make this for some specific files
    },
  },
];
