---
title: openapi-typescript Node.js API
description: Programmatic usage and unlimited flexibility.
---

# Node.js API

The Node API may be useful if dealing with dynamically-created schemas, or you’re using within context of a larger application. Pass in either a JSON-friendly object to load a schema from memory, or a string to load a schema from a local file or remote URL.

## Setup

```bash
npm i --save-dev @zkanda/openapi-typescript
```

::: tip Recommended

For the best experience, use Node ESM by adding `"type": "module"` to `package.json` ([docs](https://nodejs.org/api/esm.html#enabling))

:::

## Usage

The Node.js API accepts either a `URL`, `string`, or JSON object as input:

|   Type   | Description                 | Example                                                                                                                          |
| :------: | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
|  `URL`   | Read a local or remote file | `await openapiTS(new URL('./schema.yaml', import.meta.url))`<br/>`await openapiTS(new URL('https://myapi.com/v1/openapi.yaml'))` |
| `string` | Read dynamic YAML or JSON   | `await openapiTS('openapi: "3.1" … ')`                                                                                           |
|  `JSON`  | Read dynamic JSON           | `await openapiTS({ openapi: '3.1', … })`                                                                                         |

It also accepts `Readable` streams and `Buffer` types that are resolved and treated as strings (validation, bundling, and type generation can’t really happen without the whole document).

The Node API returns a `Promise` with the generated TypeScript as a `string`. Prepend `COMMENT_HEADER` if you’d like the same header comment the CLI adds:

::: code-group

```ts [src/my-project.ts]
import fs from "node:fs";
import openapiTS, { COMMENT_HEADER } from "@zkanda/openapi-typescript";

const output = await openapiTS(new URL("./my-schema.yaml", import.meta.url));

// (optional) write to file
fs.writeFileSync("./my-schema.ts", COMMENT_HEADER + output);
```

:::

## Options

The Node API supports all the [CLI flags](/cli#flags) in `camelCase` format, plus the following additional options:

| Name     |      Type       |     Default     | Description                                                                                  |
| :------- | :-------------: | :-------------: | :------------------------------------------------------------------------------------------- |
| `silent` |    `boolean`    |     `false`     | Silence warning messages (fatal errors will still show)                                      |
| `cwd`    | `string \| URL` | `process.cwd()` | (optional) Provide the current working directory to help resolve remote `$ref`s (if needed). |
