import { fileURLToPath } from "node:url";
import openapiTS, { COMMENT_HEADER } from "../src/index.js";
import type { OpenAPITSOptions } from "../src/types.js";
import type { TestCase } from "./test-helpers.js";

const EXAMPLES_DIR = new URL("../examples/", import.meta.url);

describe("Node.js API", () => {
  const tests: TestCase<any, OpenAPITSOptions>[] = [
    [
      "input > string > YAML",
      {
        given: `openapi: "3.1"
info:
  title: test
  version: 1.0`,
        want: `export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;`,
      },
      // options: DEFAULT_OPTIONS,
    ],
    [
      "input > string > JSON",
      {
        given: JSON.stringify({
          openapi: "3.1",
          info: { title: "test", version: "1.0" },
        }),
        want: `export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;`,
      },
      // options: DEFAULT_OPTIONS,
    ],
    [
      "input > string > URL",
      {
        given:
          "https://raw.githubusercontent.com/Redocly/redocly-cli/13e753a4ca008293dab212ad3b70109166bf93c5/__tests__/lint/oas3.1/openapi.yaml",
        want: new URL("simple-example.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
      },
    ],
    [
      "input > URL > remote",
      {
        given: new URL(
          "https://raw.githubusercontent.com/Redocly/redocly-cli/13e753a4ca008293dab212ad3b70109166bf93c5/__tests__/lint/oas3.1/openapi.yaml",
        ),
        want: new URL("simple-example.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
      },
    ],
    [
      "input > URL > local",
      {
        given: new URL("./simple-example.yaml", EXAMPLES_DIR),
        want: new URL("simple-example.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
      },
    ],
    [
      "input > object",
      {
        given: {
          openapi: "3.1",
          info: { title: "test", version: "1.0" },
        },
        want: `export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;`,
      },
      // options: DEFAULT_OPTIONS,
    ],
    [
      "input > buffer",
      {
        given: Buffer.from(`openapi: "3.1"
info:
  title: test
  version: 1.0`),
        want: `export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;`,
        // options: DEFAULT_OPTIONS,
      },
    ],
    [
      "interfaces",
      {
        given: {
          openapi: "3.1",
          info: { title: "Test", version: "1.0" },
          components: {
            schemas: {
              User: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" },
                },
                required: ["name", "email"],
              },
            },
          },
        },

        want: `export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        User: {
            name: string;
            email: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;`,
      },
    ],
    [
      "path params",
      {
        given: {
          openapi: "3.1",
          info: { title: "Test", version: "1.0" },
          paths: {
            "/user/{user_id}": {
              get: {
                parameters: [{ name: "user_id", in: "path" }],
              },
              put: {
                parameters: [{ name: "user_id", in: "path" }],
              },
            },
          },
        },
        want: `export interface paths {
    "/user/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    user_id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    user_id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;`,
      },
    ],
    [
      "snapshot > GitHub",
      {
        given: new URL("./github-api.yaml", EXAMPLES_DIR),
        want: new URL("./github-api.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
        ci: { timeout: 30_000 },
      },
    ],
    [
      "snapshot > GitHub (next)",
      {
        given: new URL("./github-api-next.yaml", EXAMPLES_DIR),
        want: new URL("./github-api-next.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
        ci: { timeout: 30_000 },
      },
    ],
    [
      "snapshot > Octokit GHES 3.6 Diff to API",
      {
        given: new URL("./octokit-ghes-3.6-diff-to-api.json", EXAMPLES_DIR),
        want: new URL("./octokit-ghes-3.6-diff-to-api.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
        ci: { timeout: 30_000 },
      },
    ],
    [
      "snapshot > Stripe",
      {
        given: new URL("./stripe-api.yaml", EXAMPLES_DIR),
        want: new URL("./stripe-api.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
        ci: { timeout: 30_000 },
      },
    ],
    [
      "snapshot > DigitalOcean",
      {
        given: new URL("./digital-ocean-api/DigitalOcean-public.v2.yaml", EXAMPLES_DIR),
        want: new URL("./digital-ocean-api.ts", EXAMPLES_DIR),
        // options: DEFAULT_OPTIONS,
        ci: { timeout: 30_000 },
      },
    ],
  ];

  for (const [testName, { given, want, options, ci }] of tests) {
    test.skipIf(ci?.skipIf)(
      testName,
      async () => {
        const result = await openapiTS(given, options);
        if (want instanceof URL) {
          await expect(`${COMMENT_HEADER}${result}`).toMatchFileSnapshot(fileURLToPath(want));
        } else {
          expect(result).toBe(`${want}\n`);
        }
      },
      ci?.timeout || 5000,
    );
  }
});
