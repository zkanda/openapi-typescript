import {
  addJSDocComment,
  astToString,
  BOOLEAN,
  type Member,
  NULL,
  NUMBER,
  oapiRef,
  STRING,
  type TypeNode,
  tsIsPrimitive,
  tsLiteral,
  tsPropertyIndex,
  tsUnion,
} from "../../src/lib/ts.js";

describe("addJSDocComment", () => {
  test("single-line comment", () => {
    const property: Member = { name: "comment", type: BOOLEAN };
    addJSDocComment({ description: "Single-line comment" }, property);
    expect(astToString({ kind: "object", members: [property] }).trim()).toBe(`{
    /** @description Single-line comment */
    comment: boolean;
}`);
  });

  test("multi-line comment", () => {
    const property: Member = { name: "comment", type: BOOLEAN };
    addJSDocComment(
      {
        summary: "This is the summary",
        description: "Multi-line comment\nLine 2",
        deprecated: true,
      },
      property,
    );
    expect(astToString({ kind: "object", members: [property] }).trim()).toBe(`{
    /**
     * This is the summary
     * @deprecated
     * @description Multi-line comment
     *     Line 2
     */
    comment: boolean;
}`);
  });

  test("escapes internal comments", () => {
    const property: Member = { name: "comment", type: BOOLEAN };
    addJSDocComment({ title: "This is a comment with `/* an example comment */` within" }, property);
    expect(astToString({ kind: "object", members: [property] }).trim()).toBe(`{
    /** This is a comment with \`/* an example comment *\\/\` within */
    comment: boolean;
}`);
  });

  test("single example", () => {
    const property: Member = { name: "comment", type: BOOLEAN };
    addJSDocComment(
      {
        example: "an-example",
      },
      property,
    );
    expect(astToString({ kind: "object", members: [property] }).trim()).toBe(`{
    /** @example an-example */
    comment: boolean;
}`);
  });

  test("array of examples", () => {
    const property: Member = { name: "comment", type: BOOLEAN };
    addJSDocComment(
      {
        examples: ["an-example", "another-example"],
      },
      property,
    );
    expect(astToString({ kind: "object", members: [property] }).trim()).toBe(`{
    /**
     * @example an-example
     * @example another-example
     */
    comment: boolean;
}`);
  });

  test("single example and array of examples", () => {
    const property: Member = { name: "comment", type: BOOLEAN };
    addJSDocComment(
      {
        example: "old-example",
        examples: ["an-example", "another-example"],
      },
      property,
    );
    expect(astToString({ kind: "object", members: [property] }).trim()).toBe(`{
    /**
     * @example old-example
     * @example an-example
     * @example another-example
     */
    comment: boolean;
}`);
  });

  test("complex examples", () => {
    const property: Member = { name: "comment", type: BOOLEAN };
    addJSDocComment(
      {
        examples: [
          {
            foo: "bar",
            results: [1, true, "abc"],
          },
          {
            foo: "bat",
            results: [5, false, "def"],
          },
        ],
      },
      property,
    );
    expect(astToString({ kind: "object", members: [property] }).trim()).toBe(`{
    /**
     * @example {
     *       "foo": "bar",
     *       "results": [
     *         1,
     *         true,
     *         "abc"
     *       ]
     *     }
     * @example {
     *       "foo": "bat",
     *       "results": [
     *         5,
     *         false,
     *         "def"
     *       ]
     *     }
     */
    comment: boolean;
}`);
  });
});

describe("oapiRef", () => {
  test("single part", () => {
    expect(astToString(oapiRef("#/components")).trim()).toBe("components");
  });

  test("multiple parts", () => {
    expect(astToString(oapiRef("#/components/schemas/User")).trim()).toBe(`components["schemas"]["User"]`);
  });

  test("`properties` of component schema `properties`", () => {
    expect(astToString(oapiRef("#/components/schemas/User/properties/username")).trim()).toBe(
      `components["schemas"]["User"]["username"]`,
    );
  });

  test("component schema named `properties`", () => {
    expect(astToString(oapiRef("#/components/schemas/properties")).trim()).toBe(`components["schemas"]["properties"]`);
  });

  test("reference into paths parameters", () => {
    expect(
      astToString(
        oapiRef("#/paths/~1endpoint/get/parameters/0", {
          in: "query",
          name: "boop",
          required: true,
        }),
      ).trim(),
    ).toBe('paths["/endpoint"]["get"]["parameters"]["query"]["boop"]');
  });
});

describe("tsPropertyIndex", () => {
  test("numbers -> number literals", () => {
    expect(tsPropertyIndex(200)).toBe("200");
    expect(tsPropertyIndex(200.5)).toBe("200.5");
    expect(tsPropertyIndex(Number.POSITIVE_INFINITY)).toBe("Infinity");
    expect(tsPropertyIndex(Number.NaN)).toBe("NaN");
    expect(tsPropertyIndex(10e3)).toBe("10000");
  });

  test("valid strings -> identifiers", () => {
    expect(tsPropertyIndex("identifier")).toBe("identifier");
    expect(tsPropertyIndex("snake_case")).toBe("snake_case");
    expect(tsPropertyIndex(200)).toBe("200");
    expect(tsPropertyIndex("$id")).toBe("$id");
    expect(tsPropertyIndex("10e3")).toBe(`"10e3"`);
  });

  test("invalid strings -> string literals", () => {
    expect(tsPropertyIndex("kebab-case")).toBe(`"kebab-case"`);
    expect(tsPropertyIndex("application/json")).toBe(`"application/json"`);
    expect(tsPropertyIndex("0invalid")).toBe(`"0invalid"`);
    expect(tsPropertyIndex("inv@lid")).toBe(`"inv@lid"`);
    expect(tsPropertyIndex("in.valid")).toBe(`"in.valid"`);
    expect(tsPropertyIndex(-1)).toBe(`"-1"`);
    expect(tsPropertyIndex("-1")).toBe(`"-1"`);
  });
});

describe("tsIsPrimitive", () => {
  test("null", () => {
    expect(tsIsPrimitive(NULL)).toBe(true);
  });

  test("number", () => {
    expect(tsIsPrimitive(NUMBER)).toBe(true);
  });

  test("string", () => {
    expect(tsIsPrimitive(STRING)).toBe(true);
  });

  test("boolean", () => {
    expect(tsIsPrimitive(BOOLEAN)).toBe(true);
  });

  test("array", () => {
    expect(tsIsPrimitive({ kind: "array", element: STRING })).toBe(false);
  });

  test("object", () => {
    expect(tsIsPrimitive({ kind: "object", members: [{ name: "foo", type: STRING }] })).toBe(false);
  });
});

describe("tsUnion", () => {
  test("none", () => {
    expect(astToString(tsUnion([])).trim()).toBe("never");
  });

  test("one", () => {
    expect(astToString(tsUnion([STRING])).trim()).toBe("string");
  });

  test("multiple (primitive)", () => {
    expect(astToString(tsUnion([STRING, STRING, NUMBER, NULL, NUMBER, NULL])).trim()).toBe("string | number | null");
  });

  test("multiple (const)", () => {
    expect(astToString(tsUnion([NULL, tsLiteral("red"), tsLiteral(42), tsLiteral(false)])).trim()).toBe(
      `null | "red" | 42 | false`,
    );
  });

  test("multiple (object types)", () => {
    const obj: TypeNode = { kind: "object", members: [{ name: "foo", type: STRING }] };
    expect(astToString(tsUnion([obj, obj, NULL])).trim()).toBe(`{
    foo: string;
} | {
    foo: string;
} | null`);
  });
});
