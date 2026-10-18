---
title: openapi-typescript CLI
description: The quickest, easiest way to generate types.
---

# CLI

The CLI is the most common way to use openapi-typescript. The CLI can parse JSON and YAML, and validates that all `$ref`s resolve and that `operationId`s are unique. It can parse local and remote schemas.

## Transforming an OpenAPI schema to TypeScript

### Single schema

The simplest way to transform schemas is by specifying an input schema (JSON or YAML), followed by `--output` (`-o`) where you’d like the output to be saved:

```bash
npx openapi-typescript schema.yaml -o schema.ts

# 🚀 schema.yaml -> schema.ts [50ms]
```

```bash
npx openapi-typescript https://petstore3.swagger.io/api/v3/openapi.yaml -o petstore.d.ts

# 🚀 https://petstore3.swagger.io/api/v3/openapi.yaml -> petstore.d.ts [250ms]
```

If no input is given, the schema is read from stdin:

```bash
cat schema.yaml | npx openapi-typescript -o schema.ts
```

### Multiple schemas

The CLI accepts a single input (a file path or URL, or stdin). To transform multiple schemas, run the CLI once per schema, for example with one npm script per schema:

::: code-group

```json [package.json]
{
  "scripts": {
    "generate:core": "openapi-typescript ./openapi/openapi.yaml -o ./openapi/openapi.ts",
    "generate:external": "openapi-typescript ./openapi/external.yaml -o ./openapi/external.ts --additional-properties"
  }
}
```

:::

::: warning

Globbing is not supported. Run openapi-typescript once per schema.

:::

## Auth

The CLI doesn’t send any custom headers or credentials when fetching remote schemas. For non-public schemas, download the schema first with your tool of choice, then pass the local file (or pipe it via stdin):

```bash
curl -H "X-API-KEY: $SECRET_KEY" https://api.example.com/v2/openapi.yaml | npx openapi-typescript -o schema.ts
```

## Flags

The following flags are supported in the CLI:

| Flag                               | Alias | Default  | Description                                                                                                         |
|:-----------------------------------| :---- | :------: |:--------------------------------------------------------------------------------------------------------------------|
| `--help`                           |       |          | Display inline help message and exit                                                                                |
| `--version`                        |       |          | Display this library’s version and exit                                                                             |
| `--output [location]`              | `-o`  | (stdout) | Where should the output file be saved?                                                                              |
| `--additional-properties`          |       | `false`  | Allow arbitrary properties for all schema objects without `additionalProperties: false`                             |
| `--default-non-nullable`           |       |  `true`  | Treat schema objects with default values as non-nullable (with the exception of parameters)                         |
| `--properties-required-by-default` |       | `false`  | Treat schema objects without `required` as having all properties required.                                          |
| `--empty-objects-unknown`          |       | `false`  | Allow arbitrary properties for schema objects with no specified properties, and no specified `additionalProperties` |
| `--check`                          |       | `false`  | Check that the generated types are up-to-date.                                                                      |
| `--exclude-deprecated`             |       | `false`  | Exclude deprecated fields from types                                                                                |
