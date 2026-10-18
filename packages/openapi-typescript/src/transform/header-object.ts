import { addJSDocComment, type Member, type TypeNode, tsPropertyIndex, UNKNOWN } from "../lib/ts.js";
import { escapePointer, getEntries } from "../lib/utils.js";
import type { HeaderObject, TransformNodeOptions } from "../types.js";
import transformMediaTypeObject from "./media-type-object.js";
import transformSchemaObject from "./schema-object.js";

/**
 * Transform HeaderObject nodes (4.8.21)
 * @see https://spec.openapis.org/oas/v3.1.0#header-object
 */
export default function transformHeaderObject(headerObject: HeaderObject, options: TransformNodeOptions): TypeNode {
  if (headerObject.schema) {
    return transformSchemaObject(headerObject.schema, options);
  }

  if (headerObject.content) {
    const members: Member[] = [];
    for (const [contentType, mediaTypeObject] of getEntries(headerObject.content ?? {}, options.ctx)) {
      const nextPath = `${options.path ?? "#"}/${escapePointer(contentType)}`;
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
    return { kind: "object", members };
  }

  return UNKNOWN;
}
