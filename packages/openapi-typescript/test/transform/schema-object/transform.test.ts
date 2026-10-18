import { astToString } from "../../../src/lib/ts.js";
import transformSchemaObject from "../../../src/transform/schema-object.js";
import type { SchemaObject } from "../../../src/types.js";
import { DEFAULT_CTX, type TestCase } from "../../test-helpers.js";

/** Map binary strings to `Blob`; leave everything else (including dates) alone */
function transform(schemaObject: SchemaObject): string | undefined {
  if ("format" in schemaObject && schemaObject.format === "binary") {
    return "Blob";
  }
  if ("format" in schemaObject && schemaObject.format === "x-union") {
    return "Blob | File";
  }
  if ("format" in schemaObject && schemaObject.format === "x-keyof") {
    return "keyof Window";
  }
}

const DEFAULT_OPTIONS = {
  path: "#/components/schemas/schema-object",
  ctx: { ...DEFAULT_CTX, transform },
};

describe("transformSchemaObject > transform", () => {
  const tests: TestCase[] = [
    [
      "replaces the type",
      {
        given: { type: "string", format: "binary" },
        want: "Blob",
      },
    ],
    [
      "undefined keeps the default type",
      {
        given: { type: "string", format: "date-time" },
        want: "string",
      },
    ],
    [
      "nullable (3.0)",
      {
        given: { type: "string", format: "binary", nullable: true },
        want: "Blob | null",
      },
    ],
    [
      "array items",
      {
        given: { type: "array", items: { type: "string", format: "binary" } },
        want: "Blob[]",
      },
    ],
    [
      "array items with a union are parenthesized",
      {
        given: { type: "array", items: { type: "string", format: "x-union" } },
        want: "(Blob | File)[]",
      },
    ],
    [
      "array items with a type operator are parenthesized",
      {
        given: { type: "array", items: { type: "string", format: "x-keyof" } },
        want: "(keyof Window)[]",
      },
    ],
    [
      "object properties",
      {
        given: {
          type: "object",
          required: ["file"],
          properties: {
            file: { type: "string", format: "binary" },
            name: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        want: `{
    /** Format: binary */
    file: Blob;
    name?: string;
    /** Format: date-time */
    createdAt?: string;
}`,
      },
    ],
    [
      "receives the original Schema Object",
      {
        given: { type: "string", format: "binary" },
        want: `"string:binary"`,
        options: {
          ...DEFAULT_OPTIONS,
          ctx: {
            ...DEFAULT_CTX,
            transform: (schemaObject) =>
              "format" in schemaObject ? `"${String(schemaObject.type)}:${schemaObject.format}"` : undefined,
          },
        },
      },
    ],
  ];

  for (const [testName, { given, want, options = DEFAULT_OPTIONS }] of tests) {
    test(testName, () => {
      expect(astToString(transformSchemaObject(given, options))).toBe(`${want}\n`);
    });
  }
});
