---
title: Advanced
description: Advanced usage as well as tips, tricks, and best practices
---

# Advanced usage

Advanced usage and various topics. Interpret this as loose recommendations for _most_ people, and feel free to disregard if it doesn’t work for your setup!

## Debugging

To enable debugging, set `DEBUG=openapi-ts:*` as an env var like so:

```sh
$ DEBUG=openapi-ts:* npx openapi-typescript schema.yaml -o my-types.ts
```

To only see certain types of debug messages, you can set `DEBUG=openapi-ts:[scope]` instead. Valid scopes are `bundle` and `ts`.

Note that debug messages will be suppressed if the output is `stdout`.

## Styleguide

Loose recommendations to improve type generation.

### Embrace `snake_case` in JS

Different languages have different preferred syntax styles. To name a few:

- `snake_case`
- `SCREAMING_SNAKE_CASE`
- `camelCase`
- `PascalCase`
- `kebab-case`

It’s tempting to want to rename API responses into `camelCase` that most JS styleguides encourage. However, **avoid renaming** because in addition to being a time sink, it introduces the following maintenance issues:

- ❌ generated types (like the ones produced by openapi-typescript) now have to be manually typed again
- ❌ renaming has to happen at runtime, which means you’re slowing down your application for an invisible change
- ❌ name transformation utilities have to be built & maintained (and tested!)
- ❌ the API probably needs `snake_case` for requestBodies anyway, so all that work now has to be undone for every API request

Instead, treat “consistency” in a more holistic sense, recognizing that preserving the API schema as-written is better than adhering to JS style conventions.

### Enable `noUncheckedIndexedAccess` in TSConfig

Enable `compilerOptions.noUncheckedIndexedAccess` in TSConfig ([docs](https://www.typescriptlang.org/tsconfig#noUncheckedIndexedAccess)) so any `additionalProperties` key will be typed as `T | undefined`.

The default behavior of [Additional Properties](https://swagger.io/docs/specification/data-models/dictionaries/) (dictionaries) will generate a type of `Record<string, T>`, which can very easily produce null reference errors. TypeScript lets you access any arbitrary key without checking it exists first, so it won’t save you from typos or the event a key is just missing.

### Be specific in your schema

openapi-typescript will **never produce an `any` type**. Anything not explicated in your schema may as well not exist. For that reason, always be as specific as possible. Here’s how to get the most out of `additionalProperties`:

<table>
  <thead>
    <tr>
      <td style="width:10%"></td>
      <th scope="col" style="width:40%">Schema</th>
      <th scope="col" style="width:40%">Generated Type</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">
        ❌ Bad
      </th>
      <td>

```yaml
type: object
```

</td>
      <td>

```ts
Record<string, never>;
```

</td>
    </tr>
    <tr>
      <th scope="row">
        ❌ Less Bad
      </th>
      <td>

```yaml
type: object
additionalProperties: true
```

</td>
      <td>

```ts
Record<string, unknown>;
```

</td>
    </tr>
    <tr>
      <th scope="row">
        ✅ Best
      </th>
      <td>

```yaml
type: object
additionalProperties:
  type: string
```

</td>
      <td>

```ts
Record<string, string>;
```

</td>
    </tr>

  </tbody>
</table>

When it comes to **tuple types**, you’ll also get better results by representing that type in your schema. Here’s the best way to type out an `[x, y]` coordinate tuple:

<table>
  <thead>
    <tr>
      <td style="width:10%">&nbsp;</td>
      <th scope="col" style="width:40%">Schema</th>
      <th scope="col" style="width:40%">Generated Type</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">
        ❌ Bad
      </th>
      <td>

```yaml
type: array
```

</td>
      <td>

```ts
unknown[]
```

</td>
    </tr>
    <tr>
      <th scope="row">
        ❌ Less Bad
      </th>
      <td>

```yaml
type: array
items:
  type: number
```

</td>
      <td>

```ts
number[]
```

</td>
    </tr>
    <tr>
      <th scope="row">
        ✅ Best
      </th>
      <td>

```yaml
type: array
items:
  type: number
prefixItems:
  - number
  - number
```

</td>
      <td>

```ts
[number, number];
```

</td>
    </tr>

  </tbody>
</table>

### Use `oneOf` by itself

OpenAPI’s composition tools (`oneOf`/`anyOf`/`allOf`) are powerful tools for reducing the amount of code in your schema while maximizing flexibility. TypeScript unions, however, don’t provide [XOR behavior](https://en.wikipedia.org/wiki/Exclusive_or), which means they don’t map directly to `oneOf`. For that reason, it’s recommended to use `oneOf` by itself, and not combined with other composition methods or other properties. e.g.:

#### ❌ Bad

::: code-group

```yaml [my-openapi-3-schema.yaml]
Pet:
  type: object
  properties:
    type:
      type: string
      enum:
        - cat
        - dog
        - rabbit
        - snake
        - turtle
    name:
      type: string
  oneOf:
    - $ref: "#/components/schemas/Cat"
    - $ref: "#/components/schemas/Dog"
    - $ref: "#/components/schemas/Rabbit"
    - $ref: "#/components/schemas/Snake"
    - $ref: "#/components/schemas/Turtle"
```

:::

This generates the following type which mixes both TypeScript unions and intersections. While this is valid TypeScript, it’s complex, and inference may not work as you intended. But the biggest offense is TypeScript can’t discriminate via the `type` property:

::: code-group

```ts [my-openapi-3-schema.d.ts]
  Pet: ({
    /** @enum {string} */
    type?: "cat" | "dog" | "rabbit" | "snake" | "turtle";
    name?: string;
  }) & (components["schemas"]["Cat"] | components["schemas"]["Dog"] | components["schemas"]["Rabbit"] | components["schemas"]["Snake"] | components["schemas"]["Turtle"]);
```

:::

#### ✅ Better

::: code-group

```yaml [my-openapi-3-schema.yaml]
Pet:
  oneOf:
    - $ref: "#/components/schemas/Cat"
    - $ref: "#/components/schemas/Dog"
    - $ref: "#/components/schemas/Rabbit"
    - $ref: "#/components/schemas/Snake"
    - $ref: "#/components/schemas/Turtle"
PetCommonProperties:
  type: object
  properties:
    name:
      type: string
Cat:
  allOf:
    - "$ref": "#/components/schemas/PetCommonProperties"
  type:
    type: string
    enum:
      - cat
```

:::

The resulting generated types are not only simpler; TypeScript can now discriminate using `type` (notice `Cat` has `type` with a single enum value of `"cat"`).

::: code-group

```ts [my-openapi-3-schema.d.ts]
Pet: components["schemas"]["Cat"] | components["schemas"]["Dog"] | components["schemas"]["Rabbit"] | components["schemas"]["Snake"] | components["schemas"]["Turtle"];
Cat: { type?: "cat"; } & components["schemas"]["PetCommonProperties"];
```

:::

_Note: you optionally could provide `discriminator.propertyName: "type"` on `Pet` ([docs](https://spec.openapis.org/oas/v3.1.0#discriminator-object)) to automatically generate the `type` key, but is less explicit._

While the schema permits you to use composition in any way you like, it’s good to always take a look at the generated types and see if there’s a simpler way to express your unions & intersections. Limiting the use of `oneOf` is not the only way to do that, but often yields the greatest benefits.

## JSONSchema $defs caveats

[JSONSchema $defs](https://json-schema.org/understanding-json-schema/structuring.html#defs) can be used to provide sub-schema definitions anywhere. However, these won’t always convert cleanly to TypeScript. For example, this works:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    DefType:
      type: object # ✅ `type: "object"` is OK to define $defs on
      $defs:
        myDefType:
          type: string
    MyType:
      type: object
      properties:
        myType:
          $ref: "#/components/schemas/DefType/$defs/myDefType"
```

:::

This will transform into the following TypeScript:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export interface components {
  schemas: {
    DefType: {
      $defs: {
        myDefType: string;
      };
    };
    MyType: {
      myType?: components["schemas"]["DefType"]["$defs"]["myDefType"]; // ✅ Works
    };
  };
}
```

:::

However, this won’t:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    DefType:
      type: string # ❌ this won’t keep its $defs
      $defs:
        myDefType:
          type: string
    MyType:
      properties:
        myType:
          $ref: "#/components/schemas/DefType/$defs/myDefType"
```

:::

Because it will transform into:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export interface components {
  schemas: {
    DefType: string;
    MyType: {
      myType?: components["schemas"]["DefType"]["$defs"]["myDefType"]; // ❌ Property '$defs' does not exist on type 'String'.
    };
  };
}
```

:::

So be wary about where you define `$defs` as they may go missing in your final generated types.

::: tip

When in doubt, you can always define `$defs` at the root schema level.

:::
