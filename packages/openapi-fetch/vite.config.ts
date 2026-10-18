import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["./src/index.js"],
    format: ["esm", "cjs"],
    fixedExtension: true,
    sourcemap: true,
    // types are hand-written in src/index.d.ts
    copy: ["d.ts", "d.mts", "d.cts"].map((ext) => ({ from: "src/index.d.ts", rename: `index.${ext}` })),
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    environment: "node",
    globals: true,
    typecheck: {
      enabled: true,
      tsconfig: "./tsconfig.json",
    },
    restoreMocks: true,
  },
});
