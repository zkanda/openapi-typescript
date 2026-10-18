// Regenerates test schema types. Add more schemas here!
import fs from "node:fs";
import openapiTS, { COMMENT_HEADER } from "@zkanda/openapi-typescript";

const schemas = {
  "./common/schemas/common.yaml": "./common/schemas/common.d.ts",
  "./http-methods/schemas/get.yaml": "./http-methods/schemas/get.d.ts",
  "./http-methods/schemas/put.yaml": "./http-methods/schemas/put.d.ts",
  "./http-methods/schemas/post.yaml": "./http-methods/schemas/post.d.ts",
  "./http-methods/schemas/delete.yaml": "./http-methods/schemas/delete.d.ts",
  "./http-methods/schemas/options.yaml": "./http-methods/schemas/options.d.ts",
  "./http-methods/schemas/head.yaml": "./http-methods/schemas/head.d.ts",
  "./http-methods/schemas/patch.yaml": "./http-methods/schemas/patch.d.ts",
  "./http-methods/schemas/trace.yaml": "./http-methods/schemas/trace.d.ts",
  "./middleware/schemas/middleware.yaml": "./middleware/schemas/middleware.d.ts",
  "./path-based-client/schemas/path-based-client.yaml": "./path-based-client/schemas/path-based-client.d.ts",
  "../../openapi-typescript/examples/github-api.yaml": "./examples/schemas/github.d.ts",
  "../../openapi-typescript/examples/stripe-api.yaml": "./examples/schemas/stripe.d.ts",
};

await Promise.all(
  Object.entries(schemas).map(async ([input, output]) => {
    const types = await openapiTS(new URL(input, import.meta.url));
    fs.writeFileSync(new URL(output, import.meta.url), `${COMMENT_HEADER}${types}`);
  }),
);
