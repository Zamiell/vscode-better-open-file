// This is the configuration file for Knip:
// https://knip.dev/overview/configuration

// @ts-check

/** @type {import("knip").KnipConfig} */
const config = {
  eslint: {},
  prettier: {},
  ignore: ["media/dialog.js"],

  ignoreDependencies: [
    "complete-lint", // This is a linting meta-package.
    "prettier", // Provided by "complete-lint".
    "prettier-plugin-organize-imports", // Provided by "complete-lint".
    "prettier-plugin-packagejson", // Provided by "complete-lint".
  ],
};

export default config;
