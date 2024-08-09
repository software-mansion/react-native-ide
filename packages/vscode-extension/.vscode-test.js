const { defineConfig } = require("@vscode/test-cli");
const { tmpdir } = require("os");
const { sep } = require("path");
const { mkdtempSync } = require("fs");

const tmpDir = mkdtempSync(`${tmpdir}${sep}`);

module.exports = defineConfig({
  files: "dist/tests/**/*.test.js",
  launchArgs: [`--user-data-dir=${tmpDir}`],
});
