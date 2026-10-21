# openapi-typescript

## 🤖 How this fork is built

Most code in this fork is written with AI assistance, guided and reviewed thoroughly by [@zkanda](https://github.com/zkanda) before merging.

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

Output must match the TypeScript compiler’s printer byte for byte: 4-space indent, multi-line object types and tuples, parentheses inside arrays/unions/intersections, and `escapeNonAsciiString()` escaping. The example snapshots in `packages/openapi-typescript/examples/` (GitHub, Stripe, DigitalOcean, Octokit) enforce this; `vp run update:examples` regenerates them, and any diff there is a formatting change.
