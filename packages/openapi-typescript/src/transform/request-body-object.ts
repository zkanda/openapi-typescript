import { addJSDocComment, type Member, NEVER, type TypeNode, tsPropertyIndex } from "../lib/ts.js";
import { createRef, getEntries } from "../lib/utils.js";
import type { RequestBodyObject, TransformNodeOptions } from "../types.js";
import transformMediaTypeObject from "./media-type-object.js";
import transformSchemaObject from "./schema-object.js";

/**
 * Transform RequestBodyObject nodes (4.8.13)
 * @see https://spec.openapis.org/oas/v3.1.0#request-body-object
 */
export default function transformRequestBodyObject(
  requestBodyObject: RequestBodyObject,
  options: TransformNodeOptions,
): TypeNode {
  const members: Member[] = [];
  for (const [contentType, mediaTypeObject] of getEntries(requestBodyObject.content ?? {}, options.ctx)) {
    const nextPath = createRef([options.path, "content", contentType]);
    const mediaType =
      "$ref" in mediaTypeObject
        ? transformSchemaObject(mediaTypeObject, {
            ...options,
            path: nextPath,
          })
        : transformMediaTypeObject(mediaTypeObject, {
            ...options,
            path: nextPath,
          });
    const member: Member = { name: tsPropertyIndex(contentType), type: mediaType };
    addJSDocComment(mediaTypeObject, member);
    members.push(member);
  }

  return {
    kind: "object",
    members: [
      {
        name: "content",
        type: {
          kind: "object",
          // add `"*/*"?: never` if no media types are defined
          members: members.length ? members : [{ name: tsPropertyIndex("*/*"), optional: true, type: NEVER }],
        },
      },
    ],
  };
}
