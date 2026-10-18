import {
  addJSDocComment,
  BOOLEAN,
  type Member,
  NEVER,
  NULL,
  NUMBER,
  oapiRef,
  STRING,
  type TypeNode,
  tsIntersection,
  tsIsPrimitive,
  tsLiteral,
  tsNullable,
  tsOmit,
  tsPropertyIndex,
  tsRecord,
  tsUnion,
  tsWithRequired,
  UNKNOWN,
} from "../lib/ts.js";
import { createDiscriminatorProperty, createRef, getEntries } from "../lib/utils.js";
import type { ReferenceObject, SchemaObject, TransformNodeOptions } from "../types.js";

/**
 * Transform SchemaObject nodes (4.8.24)
 * @see https://spec.openapis.org/oas/v3.1.0#schema-object
 */
export default function transformSchemaObject(
  schemaObject: SchemaObject | ReferenceObject,
  options: TransformNodeOptions,
): TypeNode {
  /**
   * Unexpected types & edge cases
   */

  // missing/falsy type returns `never`
  if (!schemaObject) {
    return NEVER;
  }
  // `true` returns `unknown` (this exists, but is untyped)
  if ((schemaObject as unknown) === true) {
    return UNKNOWN;
  }
  // for any other unexpected type, throw error
  if (Array.isArray(schemaObject) || typeof schemaObject !== "object") {
    throw new Error(
      `Expected SchemaObject, received ${Array.isArray(schemaObject) ? "Array" : typeof schemaObject} at ${options.path}`,
    );
  }

  /**
   * ReferenceObject
   */
  if ("$ref" in schemaObject) {
    return oapiRef(schemaObject.$ref);
  }

  /**
   * const (valid for any type)
   */
  if (schemaObject.const !== null && schemaObject.const !== undefined) {
    return tsLiteral(schemaObject.const);
  }

  /**
   * enum (non-objects)
   * note: enum is valid for any type, but for objects, handle in oneOf below
   */
  if (
    Array.isArray(schemaObject.enum) &&
    (!("type" in schemaObject) || schemaObject.type !== "object") &&
    !("properties" in schemaObject)
  ) {
    const hasAdditionalProperties = "additionalProperties" in schemaObject && !!schemaObject.additionalProperties;

    if (!hasAdditionalProperties || (schemaObject.type === "string" && hasAdditionalProperties)) {
      const enumType = schemaObject.enum.map(tsLiteral);
      if ((Array.isArray(schemaObject.type) && schemaObject.type.includes("null")) || schemaObject.nullable) {
        enumType.push(NULL);
      }

      return applyAdditionalPropertiesToEnum(hasAdditionalProperties, tsUnion(enumType), schemaObject);
    }
  }

  /**
   * Object + composition (anyOf/allOf/oneOf) types
   */

  /** Collect oneOf/anyOf */
  function collectUnionCompositions(items: (SchemaObject | ReferenceObject)[], unionKey: "anyOf" | "oneOf") {
    return items.map((item, index) =>
      transformSchemaObject(item, { ...options, path: createRef([options.path, unionKey, String(index)]) }),
    );
  }

  /** Collect allOf with Omit<> for discriminators */
  function collectAllOfCompositions(items: (SchemaObject | ReferenceObject)[], required?: string[]): TypeNode[] {
    const output: TypeNode[] = [];
    for (const item of items) {
      let itemType: TypeNode;
      // if this is a $ref, use WithRequired<X, Y> if parent specifies required properties
      // (but only for valid keys)
      if ("$ref" in item) {
        itemType = transformSchemaObject(item, options);

        const resolved = options.ctx.resolve<SchemaObject>(item.$ref);

        // make keys required, if necessary
        if (
          resolved &&
          typeof resolved === "object" &&
          "properties" in resolved &&
          // we have already handled this item (discriminator property was already added as required)
          !options.ctx.discriminators.refsHandled.includes(item.$ref)
        ) {
          // add WithRequired<X, Y> if necessary
          const validRequired = (required ?? []).filter((key) => !!resolved.properties?.[key]);
          if (validRequired.length) {
            itemType = tsWithRequired(itemType, validRequired, options.ctx.injectFooter);
          }
        }
      }
      // otherwise, if this is a schema object, combine parent `required[]` with its own, if any
      else {
        const itemRequired = [...(required ?? [])];
        if (typeof item === "object" && Array.isArray(item.required)) {
          itemRequired.push(...item.required);
        }
        itemType = transformSchemaObject({ ...item, required: itemRequired }, options);
      }

      const discriminator =
        ("$ref" in item && options.ctx.discriminators.objects[item.$ref]) || (item as any).discriminator;
      if (discriminator) {
        output.push(tsOmit(itemType, [discriminator.propertyName]));
      } else {
        output.push(itemType);
      }
    }
    return output;
  }

  // compile final type
  let finalType: TypeNode | undefined;

  // core + allOf: intersect
  const coreObjectType = transformSchemaObjectCore(schemaObject, options);
  const allOfType = collectAllOfCompositions(schemaObject.allOf ?? [], schemaObject.required);
  if (coreObjectType || allOfType.length) {
    const allOf: TypeNode | undefined = allOfType.length ? tsIntersection(allOfType) : undefined;
    finalType = tsIntersection([...(coreObjectType ? [coreObjectType] : []), ...(allOf ? [allOf] : [])]);
  }
  // anyOf: union
  // (note: this may seem counterintuitive, but as TypeScript’s unions are not true XORs, they mimic behavior closer to anyOf than oneOf)
  const anyOfType = collectUnionCompositions(schemaObject.anyOf ?? [], "anyOf");
  if (anyOfType.length) {
    finalType = tsUnion([...(finalType ? [finalType] : []), ...anyOfType]);
  }
  // oneOf: union (within intersection with other types, if any)
  const oneOfType = collectUnionCompositions(
    schemaObject.oneOf ||
      ("type" in schemaObject &&
        schemaObject.type === "object" &&
        (schemaObject.enum as (SchemaObject | ReferenceObject)[])) ||
      [],
    "oneOf",
  );
  if (oneOfType.length) {
    // note: oneOf is the only type that may include primitives
    if (oneOfType.every(tsIsPrimitive)) {
      finalType = tsUnion([...(finalType ? [finalType] : []), ...oneOfType]);
    } else {
      finalType = tsIntersection([...(finalType ? [finalType] : []), tsUnion(oneOfType)]);
    }
  }

  // When no final type can be generated, fall back to unknown type (or related variants)
  if (!finalType) {
    if ("type" in schemaObject) {
      finalType = tsRecord(STRING, options.ctx.emptyObjectsUnknown ? UNKNOWN : NEVER);
    } else {
      finalType = UNKNOWN;
    }
  }

  if (finalType !== UNKNOWN && schemaObject.nullable) {
    finalType = tsNullable([finalType]);
  }

  return finalType;
}

/**
 * Handle SchemaObject minus composition (anyOf/allOf/oneOf)
 */
function transformSchemaObjectCore(schemaObject: SchemaObject, options: TransformNodeOptions): TypeNode | undefined {
  if ("type" in schemaObject && schemaObject.type) {
    const transformed = options.ctx.transform?.(schemaObject, options);
    if (transformed !== undefined) {
      return { kind: "verbatim", text: transformed };
    }

    // primitives
    // type: null
    if (schemaObject.type === "null") {
      return NULL;
    }
    // type: string
    if (schemaObject.type === "string") {
      return STRING;
    }
    // type: number / type: integer
    if (schemaObject.type === "number" || schemaObject.type === "integer") {
      return NUMBER;
    }
    // type: boolean
    if (schemaObject.type === "boolean") {
      return BOOLEAN;
    }

    // type: array (with support for tuples)
    if (schemaObject.type === "array") {
      // default to `unknown[]`
      let itemType: TypeNode = UNKNOWN;
      // tuple type
      if (schemaObject.prefixItems || Array.isArray(schemaObject.items)) {
        const prefixItems = schemaObject.prefixItems ?? (schemaObject.items as (SchemaObject | ReferenceObject)[]);
        itemType = { kind: "tuple", elements: prefixItems.map((item) => transformSchemaObject(item, options)) };
      }
      // standard array type
      else if (schemaObject.items) {
        if (hasKey(schemaObject.items, "type") && schemaObject.items.type === "array") {
          itemType = { kind: "array", element: transformSchemaObject(schemaObject.items, options) };
        } else {
          itemType = transformSchemaObject(schemaObject.items, options);
        }
      }

      // wrap itemType in array type, but only if not a tuple or array already
      return itemType.kind === "tuple" || itemType.kind === "array" ? itemType : { kind: "array", element: itemType };
    }

    // polymorphic, or 3.1 nullable
    if (Array.isArray(schemaObject.type) && !Array.isArray(schemaObject)) {
      // skip any primitive types that appear in oneOf as well
      const uniqueTypes: TypeNode[] = [];
      if (Array.isArray(schemaObject.oneOf)) {
        for (const t of schemaObject.type) {
          if (
            (t === "boolean" || t === "string" || t === "number" || t === "integer" || t === "null") &&
            schemaObject.oneOf.find((o) => typeof o === "object" && "type" in o && o.type === t)
          ) {
            continue;
          }
          uniqueTypes.push(
            t === "null" || t === null
              ? NULL
              : transformSchemaObject(
                  { ...schemaObject, type: t, oneOf: undefined } as SchemaObject, // don’t stack oneOf transforms
                  options,
                ),
          );
        }
      } else {
        for (const t of schemaObject.type) {
          if (t === "null" || t === null) {
            uniqueTypes.push(NULL);
          } else {
            uniqueTypes.push(transformSchemaObject({ ...schemaObject, type: t } as SchemaObject, options));
          }
        }
      }
      return tsUnion(uniqueTypes);
    }
  }

  // type: object
  const coreObjectType: Member[] = [];

  // discriminators: explicit mapping on schema object
  for (const k of ["allOf", "anyOf"] as const) {
    if (!schemaObject[k]) {
      continue;
    }
    // for all magic inheritance, we will have already gathered it into
    // ctx.discriminators. But stop objects from referencing their own
    // discriminator meant for children (!schemaObject.discriminator)
    // and don't add discriminator properties if we already added/patched
    // them (options.ctx.discriminators.refsHandled.includes(options.path!).
    const discriminator =
      !schemaObject.discriminator &&
      !options.ctx.discriminators.refsHandled.includes(options.path ?? "") &&
      options.ctx.discriminators.objects[options.path ?? ""];
    if (discriminator) {
      coreObjectType.unshift(createDiscriminatorProperty(discriminator, { path: options.path ?? "" }));
      break;
    }
  }

  if (
    ("properties" in schemaObject && schemaObject.properties && Object.keys(schemaObject.properties).length) ||
    ("additionalProperties" in schemaObject && schemaObject.additionalProperties) ||
    ("patternProperties" in schemaObject && schemaObject.patternProperties) ||
    ("$defs" in schemaObject && schemaObject.$defs)
  ) {
    // properties
    if ("properties" in schemaObject && schemaObject.properties && Object.keys(schemaObject?.properties).length) {
      for (const [k, v] of getEntries(schemaObject.properties ?? {}, options.ctx)) {
        if ((typeof v !== "object" && typeof v !== "boolean") || Array.isArray(v)) {
          throw new Error(
            `${options.path}: invalid property ${k}. Expected Schema Object or boolean, got ${
              Array.isArray(v) ? "Array" : typeof v
            }`,
          );
        }

        const { $ref, readOnly, hasDefault } =
          typeof v === "object"
            ? {
                $ref: "$ref" in v && v.$ref,
                readOnly: "readOnly" in v && v.readOnly,
                hasDefault: "default" in v && v.default !== undefined,
              }
            : {};

        // handle excludeDeprecated option
        if (options.ctx.excludeDeprecated) {
          const resolved = $ref ? options.ctx.resolve<SchemaObject>($ref) : v;
          if ((resolved as SchemaObject)?.deprecated) {
            continue;
          }
        }
        const optional = !(
          schemaObject.required?.includes(k) ||
          (schemaObject.required === undefined && options.ctx.propertiesRequiredByDefault) ||
          (hasDefault &&
            options.ctx.defaultNonNullable &&
            !options.path?.includes("parameters") &&
            !options.path?.includes("requestBody") &&
            !options.path?.includes("requestBodies")) // can’t be required, even with defaults
        );
        const member: Member = {
          name: tsPropertyIndex(k),
          readonly: !!readOnly,
          optional,
          type: $ref
            ? oapiRef($ref)
            : transformSchemaObject(v, {
                ...options,
                path: createRef([options.path, k]),
              }),
        };
        addJSDocComment(v, member);
        coreObjectType.push(member);
      }
    }

    // $defs
    if ("$defs" in schemaObject && typeof schemaObject.$defs === "object" && Object.keys(schemaObject.$defs).length) {
      const defKeys: Member[] = [];
      for (const [k, v] of Object.entries(schemaObject.$defs)) {
        const member: Member = {
          name: tsPropertyIndex(k),
          readonly: "readOnly" in v && !!v.readOnly,
          type: transformSchemaObject(v, { ...options, path: createRef([options.path, "$defs", k]) }),
        };
        addJSDocComment(v, member);
        defKeys.push(member);
      }
      coreObjectType.push({ name: "$defs", type: { kind: "object", members: defKeys } });
    }

    // additionalProperties / patternProperties
    const hasExplicitAdditionalProperties =
      typeof schemaObject.additionalProperties === "object" && Object.keys(schemaObject.additionalProperties).length;
    const hasImplicitAdditionalProperties =
      schemaObject.additionalProperties === true ||
      (typeof schemaObject.additionalProperties === "object" &&
        Object.keys(schemaObject.additionalProperties).length === 0);
    const patternProperties = hasKey(schemaObject, "patternProperties") ? schemaObject.patternProperties : undefined;
    const hasExplicitPatternProperties =
      typeof patternProperties === "object" && patternProperties !== null && Object.keys(patternProperties).length > 0;
    const stringIndexTypes = [];
    if (hasExplicitAdditionalProperties) {
      stringIndexTypes.push(transformSchemaObject(schemaObject.additionalProperties as SchemaObject, options));
    }
    if (hasImplicitAdditionalProperties || (!schemaObject.additionalProperties && options.ctx.additionalProperties)) {
      stringIndexTypes.push(UNKNOWN);
    }
    if (hasExplicitPatternProperties && patternProperties && typeof patternProperties === "object") {
      for (const [_, v] of getEntries(
        patternProperties as Record<string, SchemaObject | ReferenceObject>,
        options.ctx,
      )) {
        stringIndexTypes.push(transformSchemaObject(v, options));
      }
    }

    if (stringIndexTypes.length === 0) {
      return coreObjectType.length ? { kind: "object", members: coreObjectType } : undefined;
    }

    const stringIndexType = tsUnion(stringIndexTypes);

    return tsIntersection([
      ...(coreObjectType.length ? [{ kind: "object", members: coreObjectType } as TypeNode] : []),
      { kind: "object", members: [{ name: "", indexSignature: "key", type: stringIndexType }] },
    ]);
  }

  return coreObjectType.length ? { kind: "object", members: coreObjectType } : undefined;
}

/**
 * Check if an object has a key
 * @param possibleObject - The object to check
 * @param key - The key to check for
 * @returns True if the object has the key, false otherwise
 */
function hasKey<K extends string>(possibleObject: unknown, key: K): possibleObject is { [key in K]: unknown } {
  return typeof possibleObject === "object" && possibleObject !== null && key in possibleObject;
}

function applyAdditionalPropertiesToEnum(
  hasAdditionalProperties: boolean,
  unionType: TypeNode,
  schemaObject: SchemaObject,
) {
  // If additionalProperties is true, add (string & {}) to the union
  if (hasAdditionalProperties && schemaObject.type === "string") {
    const stringAndEmptyObject = tsIntersection([STRING, { kind: "object", members: [] }]);
    return tsUnion([unionType, stringAndEmptyObject]);
  }
  return unionType;
}
