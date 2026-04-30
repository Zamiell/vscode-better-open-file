// This is the configuration file for Knip:
// https://knip.dev/overview/configuration

// @ts-check

/** @type {import("knip").KnipConfig} */
const config = {
  eslint: {},
  prettier: {},

  // The "src/extension.ts" entry point is found automatically by Knip.
  entry: ["webview/dialog.ts"],

  ignoreDependencies: [
    "complete-lint", // This is a linting meta-package.
    "eslint-config-complete", // Provided by "complete-lint".
    "eslint", // Provided by "complete-lint".
    "prettier", // Provided by "complete-lint".
    "prettier-plugin-organize-imports", // Provided by "complete-lint".
    "prettier-plugin-packagejson", // Provided by "complete-lint".
  ],
};

export default config;
