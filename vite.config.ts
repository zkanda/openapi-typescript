import { defineConfig } from "vite-plus";

// Generated and vendored files that are never linted or formatted
const IGNORE = [
  "**/dist/**",
  "**/node_modules/**",
  "**/CHANGELOG.md",
  "docs/**",
  ".changeset/**",
  "pnpm-lock.yaml",
  "packages/openapi-fetch/examples/**",
  "packages/openapi-fetch/test/**/schemas/**",
  "packages/openapi-fetch/test/bench/**/*.min.js",
  "packages/openapi-typescript/examples/**",
  "packages/openapi-typescript/test/fixtures/**",
];

export default defineConfig({
  lint: {
    ignorePatterns: IGNORE,
    plugins: ["typescript", "unicorn", "oxc"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      curly: "error",
      "no-console": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  fmt: {
    ignorePatterns: [...IGNORE, "**/*.md", "**/*.yaml", "**/*.yml", "**/package.json"],
    printWidth: 120,
  },
});
