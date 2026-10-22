---
"@zkanda/openapi-typescript": patch
---

Inline schemas referenced by a `$ref` outside `paths`, `webhooks`, `components`, and `$defs` (e.g. `#/x-shared/Tag`). These were printed as `x-shared["Tag"]`, which is not valid TypeScript. A circular one becomes `unknown`.
