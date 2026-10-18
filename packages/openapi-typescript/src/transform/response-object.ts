import { addJSDocComment, type Member, NEVER, oapiRef, type TypeNode, tsPropertyIndex, UNKNOWN } from "../lib/ts.js";
import { createRef, getEntries } from "../lib/utils.js";
import type { ResponseObject, TransformNodeOptions } from "../types.js";
import transformHeaderObject from "./header-object.js";
import transformMediaTypeObject from "./media-type-object.js";

/**
 * Transform ResponseObject nodes (4.8.17)
 * @see https://spec.openapis.org/oas/v3.1.0#response-object
 */
export default function transformResponseObject(
  responseObject: ResponseObject,
  options: TransformNodeOptions,
): TypeNode {
  const members: Member[] = [];

  // headers
  const headers: Member[] = [];
  if (responseObject.headers) {
    for (const [name, headerObject] of getEntries(responseObject.headers, options.ctx)) {
      const subType =
        "$ref" in headerObject
          ? oapiRef(headerObject.$ref)
          : transformHeaderObject(headerObject, {
              ...options,
              path: createRef([options.path, "headers", name]),
            });
      const member: Member = {
        name: tsPropertyIndex(name),
        optional: !("$ref" in headerObject || headerObject.required),
        type: subType,
      };
      addJSDocComment(headerObject, member);
      headers.push(member);
    }
  }
  // allow additional unknown headers
  headers.push({ name: "", indexSignature: "name", type: UNKNOWN });
  members.push({ name: "headers", type: { kind: "object", members: headers } });

  // content
  const content: Member[] = [];
  if (responseObject.content) {
    for (const [contentType, mediaTypeObject] of getEntries(responseObject.content ?? {}, options.ctx)) {
      const member: Member = {
        name: tsPropertyIndex(contentType),
        type: transformMediaTypeObject(mediaTypeObject, {
          ...options,
          path: createRef([options.path, "content", contentType]),
        }),
      };
      addJSDocComment(mediaTypeObject, member);
      content.push(member);
    }
  }
  if (content.length) {
    members.push({ name: "content", type: { kind: "object", members: content } });
  } else {
    members.push({ name: "content", optional: true, type: NEVER });
  }

  return { kind: "object", members };
}
