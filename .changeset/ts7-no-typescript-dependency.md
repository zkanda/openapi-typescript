---
"openapi-typescript": major
---

Remove the dependency on the `typescript` package so type generation works with TypeScript 7, and simplify:

- `openapiTS()` now returns the generated TypeScript as a string.
- Replace `@redocly/openapi-core` with a built-in loader and bundler. Redocly config (`--redocly`, `redocly.yaml` apis) and lint rules other than unresolved `$ref`s and duplicate `operationId`s are removed.
- Remove options: `enum`, `enumValues`, `conditionalEnums`, `dedupeEnums`, `exportType`, `immutable`, `arrayLength`, `pathParamsAsTypes`, `alphabetize`, `rootTypes`, `rootTypesNoSchemaPrefix`, `rootTypesKeepCasing`, `makePathsEnum`, `generatePathParams`, `readWriteMarkers`, `inject`, `transform`, `postTransform`, `transformProperty`.
- Output for the remaining options is unchanged.
