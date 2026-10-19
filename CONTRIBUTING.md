# Contributing

Contributions are welcome!

## Setup

This monorepo uses [Vite+](https://viteplus.dev) (`vp`) for everything: installing dependencies, building, linting, formatting, testing, and running commands across packages. Under the hood it manages Node.js and the [pnpm workspace](https://pnpm.io/workspaces) that lets packages pull from local versions rather than remote.

**Always use `vp`.** Don’t call `pnpm`, `npm`, or `npx` directly.

| Task | Command |
| :--- | :--- |
| Install dependencies | `vp install` |
| Run a `package.json` script | `vp run <script>` |
| Format, lint, type check | `vp check` |
| Test (watch) | `vp test` |
| Run a local binary | `vp exec <bin>` |
| Add a dependency | `vp add <pkg>` |

After [installing Vite+](https://viteplus.dev/guide/), running the following commands from the root will set everything up:

```sh
vp install
vp run build
```

## Workspace vs local commands

The “workspace“ is the root `package.json`. Running commands here will run on all packages. For example, running `vp run build` in the workspace root will build all packages. But running `cd packages/openapi-typescript && vp run build` will only build that one package.

It’s worth noting that some packages depend on others in the monorepo. For example, `openapi-fetch` depends on `openapi-typescript` building built. If running commands per-package, you’d have to manually build each package before the test suite could run. But running `vp run build` in the workspace root once will build all packages for you, so that you can run any test suite.

> ![NOTE]
>
> Note that if any package changes, be sure to rebuild before running tests! Of course, CI will always do this, but in case you see differences between local vs CI, this is usually the culprit—a stale build.

Again, `vp run` is there so that you don’t have to think about all the packages as much, if you’re just contributing to one. But these tips may help you troubleshoot if something unexpected happens.

## Structure

This monorepo has 2 main sections: the `docs/` that deploy to `openapi-ts.dev`, and `packages/` which are all the npm packages. Each npm package has its own `CONTRIBUTING.md` doc that describes setup needed for that package.

```
┬── docs/
└── packages/
    ├── openapi-fetch/
    ├── openapi-typescript/
    └── openapi-typescript-helpers/
```
