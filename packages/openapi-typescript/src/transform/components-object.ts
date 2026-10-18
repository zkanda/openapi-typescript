import { performance } from "node:perf_hooks";
import { addJSDocComment, type Member, NEVER, type TypeNode, tsPropertyIndex } from "../lib/ts.js";
import { createRef, debug, getEntries } from "../lib/utils.js";
import type { ComponentsObject, GlobalContext, SchemaObject, TransformNodeOptions } from "../types.js";
import transformHeaderObject from "./header-object.js";
import transformParameterObject from "./parameter-object.js";
import transformPathItemObject from "./path-item-object.js";
import transformRequestBodyObject from "./request-body-object.js";
import transformResponseObject from "./response-object.js";
import transformSchemaObject from "./schema-object.js";

type ComponentTransforms = keyof Omit<ComponentsObject, "examples" | "securitySchemes" | "links" | "callbacks">;

const transformers: Record<ComponentTransforms, (node: any, options: TransformNodeOptions) => TypeNode> = {
  schemas: transformSchemaObject,
  responses: transformResponseObject,
  parameters: transformParameterObject,
  requestBodies: transformRequestBodyObject,
  headers: transformHeaderObject,
  pathItems: transformPathItemObject,
};

/**
 * Transform the ComponentsObject (4.8.7)
 * @see https://spec.openapis.org/oas/latest.html#components-object
 */
export default function transformComponentsObject(componentsObject: ComponentsObject, ctx: GlobalContext): TypeNode {
  const members: Member[] = [];
  for (const key of Object.keys(transformers) as ComponentTransforms[]) {
    const componentT = performance.now();

    const items: Member[] = [];
    if (componentsObject[key]) {
      for (const [name, item] of getEntries<SchemaObject>(componentsObject[key], ctx)) {
        const member: Member = {
          name: tsPropertyIndex(name),
          type: transformers[key](item, {
            path: createRef(["components", key, name]),
            schema: item,
            ctx,
          }),
        };
        addJSDocComment(item as unknown as any, member);
        items.push(member);
      }
    }
    members.push({ name: key, type: items.length ? { kind: "object", members: items } : NEVER });

    debug(`Transformed components → ${key}`, "ts", performance.now() - componentT);
  }

  return { kind: "object", members };
}
