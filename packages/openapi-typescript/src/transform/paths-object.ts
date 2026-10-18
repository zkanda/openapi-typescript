import { performance } from "node:perf_hooks";
import { addJSDocComment, type Member, oapiRef, type TypeNode, tsPropertyIndex } from "../lib/ts.js";
import { createRef, debug, getEntries } from "../lib/utils.js";
import type { GlobalContext, PathsObject } from "../types.js";
import transformPathItemObject from "./path-item-object.js";

/**
 * Transform the PathsObject node (4.8.8)
 * @see https://spec.openapis.org/oas/v3.1.0#operation-object
 */
export default function transformPathsObject(pathsObject: PathsObject, ctx: GlobalContext): TypeNode {
  const members: Member[] = [];
  for (const [url, pathItemObject] of getEntries(pathsObject, ctx)) {
    if (!pathItemObject || typeof pathItemObject !== "object") {
      continue;
    }

    const pathT = performance.now();

    // handle $ref
    if ("$ref" in pathItemObject) {
      const member: Member = { name: tsPropertyIndex(url), type: oapiRef(pathItemObject.$ref) };
      addJSDocComment(pathItemObject, member);
      members.push(member);
    } else {
      members.push({
        name: tsPropertyIndex(url),
        type: transformPathItemObject(pathItemObject, {
          path: createRef(["paths", url]),
          ctx,
        }),
      });

      debug(`Transformed path "${url}"`, "ts", performance.now() - pathT);
    }
  }

  return { kind: "object", members };
}
