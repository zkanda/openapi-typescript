---
title: Migration Guide
description: Migrating between openapi-typescript versions
---

# Migrating to the TypeScript 7–compatible release

openapi-typescript no longer depends on the `typescript` package (or on `@redocly/openapi-core`). It now ships its own small loader and bundler, so the generator runs regardless of which TypeScript version is installed in your project, including TypeScript 7. For the options that remain, the generated output is identical to before.

### `openapiTS()` returns a string

The Node.js API now returns the generated types as a `string` rather than a TypeScript AST, so there’s no need for `astToString()` anymore:

```ts
import fs from "node:fs";
import openapiTS, { COMMENT_HEADER } from "openapi-typescript";

const output = await openapiTS(new URL("./my-schema.yaml", import.meta.url));
fs.writeFileSync("./my-schema.d.ts", COMMENT_HEADER + output);
```

`astToString()` is still exported, but it only prints the package’s own minimal AST.

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

[See the full CHANGELOG](https://github.com/openapi-ts/openapi-typescript/blob/main/packages/openapi-typescript/CHANGELOG.md)
