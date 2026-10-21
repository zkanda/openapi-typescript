# CLAUDE.md

Always use [Vite+](https://viteplus.dev) (`vp`). Never call `pnpm`, `npm`, or `npx` directly.

- Install: `vp install`
- Scripts: `vp run <script>` (e.g. `vp run build`, `vp run test`)
- Format, lint, type check: `vp check`
- Local binaries: `vp exec <bin>` (e.g. `vp exec changeset`)
- Add a dependency: `vp add <pkg>`

Vite+ docs: `node_modules/vite-plus/docs` or https://viteplus.dev/guide/. See `CONTRIBUTING.md` for setup.
