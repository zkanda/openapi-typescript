import { addJSDocComment, type Member, NEVER, oapiRef, tsPropertyIndex } from "../lib/ts.js";
import { createRef } from "../lib/utils.js";
import type { OperationObject, RequestBodyObject, TransformNodeOptions } from "../types.js";
import { transformParametersArray } from "./parameters-array.js";
import transformRequestBodyObject from "./request-body-object.js";
import transformResponsesObject from "./responses-object.js";

/**
 * Transform OperationObject nodes (4.8.10)
 * @see https://spec.openapis.org/oas/v3.1.0#operation-object
 */
export default function transformOperationObject(
  operationObject: OperationObject,
  options: TransformNodeOptions,
): Member[] {
  const members: Member[] = [];

  // parameters
  members.push(...transformParametersArray(operationObject.parameters ?? [], options));

  // requestBody
  if (operationObject.requestBody) {
    const requestBodyType =
      "$ref" in operationObject.requestBody
        ? oapiRef(operationObject.requestBody.$ref)
        : transformRequestBodyObject(operationObject.requestBody, {
            ...options,
            path: createRef([options.path, "requestBody"]),
          });
    const required = !!(
      "$ref" in operationObject.requestBody
        ? options.ctx.resolve<RequestBodyObject>(operationObject.requestBody.$ref)
        : operationObject.requestBody
    )?.required;
    const member: Member = { name: "requestBody", optional: !required, type: requestBodyType };
    addJSDocComment(operationObject.requestBody, member);
    members.push(member);
  } else {
    members.push({ name: "requestBody", optional: true, type: NEVER });
  }

  // responses
  members.push({ name: "responses", type: transformResponsesObject(operationObject.responses ?? {}, options) });

  return members;
}

/** inject an operation at the top level */
export function injectOperationObject(
  operationId: string,
  operationObject: OperationObject,
  options: TransformNodeOptions,
): void {
  // find or create top-level operations interface
  let operations = options.ctx.injectFooter.find((node) => node.kind === "interface" && node.name === "operations");
  if (operations?.kind !== "interface") {
    operations = { kind: "interface", name: "operations", members: [] };
    options.ctx.injectFooter.push(operations);
  }

  // inject operation object
  operations.members.push({
    name: tsPropertyIndex(operationId),
    type: { kind: "object", members: transformOperationObject(operationObject, options) },
  });
}
