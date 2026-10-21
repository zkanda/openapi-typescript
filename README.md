# openapi-typescript

## 🤖 How this fork is built

Most code in this fork is written with AI assistance, guided and reviewed thoroughly by [@zkanda](https://github.com/zkanda) before merging.

## ⚡ Development

This monorepo uses [Vite+](https://viteplus.dev) (`vp`). Never call `pnpm`, `npm`, or `npx` directly.

```sh
curl -fsSL https://vite.plus | bash   # install Vite+ (Windows: irm https://vite.plus/ps1 | iex)
vp install
vp run build
```

| Task                     | Command                                          |
| :----------------------- | :----------------------------------------------- |
| Build (watch)            | `vp run dev`                                     |
| Test all                 | `vp run test`                                    |
| Test one file            | `vp test run <partial filename>`                 |
| Format, lint, type check | `vp check`                                       |
| Update example snapshots | `vp run update:examples` (in openapi-typescript) |
| Add a changeset          | `vp exec changeset`                              |
| Add a dependency         | `vp add <pkg>`                                   |

Commands run from the root apply to every package; from `packages/<name>` they apply to that package only.

Tests import the built `dist/`, so rebuild (or keep `vp run dev` running) before testing. `openapi-fetch` tests also need `openapi-typescript` built.

## 🛠️ How code generation works

openapi-typescript does not depend on the TypeScript compiler. TypeScript 7 dropped the JS API (`ts.factory`, `ts.createPrinter`) the generator used, so [`packages/openapi-typescript/src/lib/ts.ts`](./packages/openapi-typescript/src/lib/ts.ts) holds a minimal type AST and printer of its own.

```
OpenAPI spec ──► src/transform/*.ts ──► TypeNode tree ──► astToString() ──► .d.ts
                 (built with the        (plain objects)    (printer)
                  ts*() helpers)
```

### The AST

Plain objects tagged by `kind`. Only what the generator emits is modeled:

| Node                    | Prints as                        |
| :---------------------- | :------------------------------- |
| `keyword`               | `string`, `number`, `never`, …   |
| `literal`               | `"foo"`, `1`, `true`             |
| `ref`                   | `components`, `Record<K, V>`     |
| `indexed`               | `T["key"]`                       |
| `array`, `tuple`        | `T[]`, `[A, B]`                  |
| `union`, `intersection` | `A \| B`, `A & B`                |
| `object`                | `{ key: T; }` (from `Member`s)   |
| `verbatim`              | text from the `transform` option |

Declarations (`interface`, `alias`, `raw`) wrap these at the top level. A `Member` is a property or index signature with optional `optional`, `readonly`, and JSDoc `comment`.

### Adding output

1. Build nodes with the helpers, not by hand: `tsUnion`, `tsIntersection` (both dedupe primitives), `tsLiteral`, `tsRecord`, `tsOmit`, `tsWithRequired`, `oapiRef` (`$ref` → `components["schemas"]["Foo"]`), `addJSDocComment`.
2. Add a node kind only when no existing one fits, then give it a case in `printType()`. TypeScript’s exhaustiveness check flags the missing case.

### The printer rule

Formatting is frozen at what TypeScript 5.9’s printer produced: 4-space indent, multi-line object types and tuples, parentheses inside arrays/unions/intersections, and `escapeNonAsciiString()` escaping. The example snapshots in `packages/openapi-typescript/examples/` (GitHub, Stripe, DigitalOcean, Octokit) enforce it, not TypeScript, so later TypeScript formatting changes are not followed. `vp run update:examples` regenerates them; any diff there is a formatting change.

### Validity check

Nothing in the AST stops invalid TypeScript (names and literals are printed verbatim), so every test also type-checks its output. `test/typecheck-output.ts` records each `astToString()` call during a test file, wraps fragments as `type T = …;`, and runs `tsc` over them; names the full document would declare (`components`, `paths`, …) are stubbed. A failure lists the `tsc` errors and the offending source.

## 🔌 openapi-fetch

Types and runtime are written separately: `src/index.d.ts` holds the type inference, `src/index.js` the runtime. Change both together.

Tests check types as well as values:

- Use `assertType<T>(…)` for the inferred type.
- Use `// @ts-expect-error` to test that invalid input is rejected, scoped to the exact line by splitting the expression.
- Write type tests out by hand; `test.each` hides errors.
