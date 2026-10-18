---
title: Migration Guide
description: Migrating between openapi-typescript versions
---

# Migrating to 8.x

openapi-typescript no longer depends on the `typescript` package (or on `@redocly/openapi-core`). It now ships its own small loader and bundler, so the generator runs regardless of which TypeScript version is installed in your project, including TypeScript 7. For the options that remain, the generated output is identical to before.

### Packages renamed

All packages are now published under the `@zkanda` scope:

| Before                       | After                                |
| :--------------------------- | :----------------------------------- |
| `openapi-typescript`         | `@zkanda/openapi-typescript`         |
| `openapi-fetch`              | `@zkanda/openapi-fetch`              |
| `openapi-typescript-helpers` | `@zkanda/openapi-typescript-helpers` |

Swap the packages:

```bash
npm uninstall openapi-typescript openapi-fetch
npm i @zkanda/openapi-fetch
npm i -D @zkanda/openapi-typescript
```

Then update imports:

```diff
- import createClient from "openapi-fetch";
+ import createClient from "@zkanda/openapi-fetch";
```

The CLI command is still `openapi-typescript`, so `package.json` scripts keep working once the new package is installed. Generated types don’t import anything, so they don’t need regenerating.

### Node.js 22 or later

openapi-typescript requires Node.js 22 or later.

### `openapiTS()` returns a string

The Node.js API now returns the generated types as a `string` rather than a TypeScript AST, so there’s no need for `astToString()` anymore:

```ts
import fs from "node:fs";
import openapiTS, { COMMENT_HEADER } from "@zkanda/openapi-typescript";

const output = await openapiTS(new URL("./my-schema.yaml", import.meta.url));
fs.writeFileSync("./my-schema.d.ts", COMMENT_HEADER + output);
```

`astToString()` is still exported, but it only prints the package’s own minimal AST.

### Trade-offs of the built-in AST

Dropping the TypeScript compiler API removes the TypeScript version lock, but costs some flexibility:

- **No AST hooks.** `transform`, `postTransform`, and `transformProperty` took or returned TypeScript AST nodes and are gone. Customizations such as mapping `format: date-time` to `Date` now mean changing the schema or post-processing the output string.
- **Helpers use the package’s own node types.** `astToString()`, `tsUnion()`, `tsLiteral()`, `oapiRef()`, and the other exported helpers take and return the package’s minimal AST, not `ts.TypeNode`. Code that mixed them with `ts.factory` needs rewriting.
- **Output is a string.** To run TypeScript transformers on it, parse it again yourself.
- **Printing is maintained here.** Escaping, quoting, and formatting are reimplemented for what the generator emits, so they no longer get fixes from the TypeScript printer. Output for the GitHub, Stripe, DigitalOcean, and Octokit example schemas is byte-identical to the TypeScript printer’s.

### Removed

- `typescript` is no longer a peer dependency.
- CLI flags: `--enum`, `--enum-values`, `--conditional-enums`, `--dedupe-enums`, `--export-type` (`-t`), `--immutable`, `--array-length`, `--path-params-as-types`, `--alphabetize`, `--root-types`, `--root-types-no-schema-prefix`, `--root-types-keep-casing`, `--make-paths-enum`, `--generate-path-params`, and `--read-write-markers` (the generator no longer emits `$Read`/`$Write` markers).
- Node.js API options: `inject`, `transform`, `postTransform`, and `transformProperty`.
- Redocly config support: `--redocly` (`-c`), `redocly.yaml` `apis` / `x-openapi-ts` settings, and multiple-schema config. To generate types for multiple schemas, [run the CLI once per schema](./cli#multiple-schemas).
- Redocly lint rules: linting now only reports unresolved `$ref`s and duplicate `operationId`s (as errors). No other lint rules run.
- The `openapi-react-query`, `swr-openapi`, and `openapi-metadata` packages.

# Migrating to 7.x

The 7.x release only has a few minor breaking changes to be aware of:

### Authentication / remote schema fetching

Remote schemas are fetched without any custom headers or credentials. For non-public schemas, download the schema first and pass the local file (or stdin) to the CLI ([docs](./cli#auth)).

### defaultNonNullable: true by default

The CLI and Node.js API now have `--default-non-nullable` behavior enabled by default. This means if a schema object has a `default` value, it will be treated as if it’s `required` (with the exception of parameters).

### Globbing removed

Globbing is no longer supported. To generate types for multiple schemas, run the CLI once per schema ([docs](./cli#multiple-schemas)).

### Node.js API input types

The input types have changed slightly in 7.x to be more predictable and versatile.

```ts
import openapiTS from "openapi-typescript";

await openapiTS(input);
```

| Input         |       6.x       |   7.x    |
| :------------ | :-------------: | :------: |
| JSON (object) |    `Object`     | `Object` |
| JSON (string) | (not supported) | `string` |
| YAML (string) | (not supported) | `string` |
| Local file    | `string \| URL` |  `URL`   |
| Remote file   | `string \| URL` |  `URL`   |

The biggest change is the handling of `string`s—in 6.x a string could refer to a local or remote filepath, but this was unpredictable because for local filepaths it would depend where Node was called from. In 7.x, **all filepaths must be a [URL](https://nodejs.org/api/url.html)** (for local paths, use `new URL('./path/to/my/schema', import.meta.url)` or `new URL('file:///absolute/path/to/my/schema')`). This lets the `string` type handle inline YAML (or JSON) which wasn’t supported in 6.x.

[See the updated docs for more info](./node#usage).

---

[See the full CHANGELOG](https://github.com/zkanda/openapi-typescript/blob/main/packages/openapi-typescript/CHANGELOG.md)
