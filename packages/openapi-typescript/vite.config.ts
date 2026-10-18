import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["./src/index.ts"],
    format: ["esm", "cjs"],
    fixedExtension: true,
    dts: true,
    sourcemap: true,
    // Don’t bundle modules together to more closely match old exports (can remove in next major)
    unbundle: true,
  },
  test: {
    environment: "node",
    clearMocks: true,
    globals: true,
  },
});
