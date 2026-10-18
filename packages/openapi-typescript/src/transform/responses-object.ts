import { addJSDocComment, type Member, NEVER, oapiRef, type TypeNode, tsPropertyIndex } from "../lib/ts.js";
import { createRef, getEntries } from "../lib/utils.js";
import type { ResponsesObject, TransformNodeOptions } from "../types.js";
import transformResponseObject from "./response-object.js";

/**
 * Transform ResponsesObject nodes (4.8.16)
 * @see https://spec.openapis.org/oas/v3.1.0#responses-object
 */
export default function transformResponsesObject(
  responsesObject: ResponsesObject,
  options: TransformNodeOptions,
): TypeNode {
  const members: Member[] = [];

  for (const [responseCode, responseObject] of getEntries(responsesObject, options.ctx)) {
    const responseType =
      "$ref" in responseObject
        ? oapiRef(responseObject.$ref)
        : transformResponseObject(responseObject, {
            ...options,
            path: createRef([options.path, "responses", responseCode]),
          });
    const member: Member = { name: tsPropertyIndex(responseCode), type: responseType };
    addJSDocComment(responseObject, member);
    members.push(member);
  }

  return members.length ? { kind: "object", members } : NEVER;
}
