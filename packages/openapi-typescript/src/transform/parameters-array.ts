import { addJSDocComment, type Member, NEVER, oapiRef, tsPropertyIndex } from "../lib/ts.js";
import { createRef } from "../lib/utils.js";
import type { ParameterObject, ReferenceObject, TransformNodeOptions } from "../types.js";
import transformParameterObject from "./parameter-object.js";

/**
 * Synthetic type. Array of (ParameterObject | ReferenceObject)s found in OperationObject and PathItemObject.
 */
export function transformParametersArray(
  parametersArray: (ParameterObject | ReferenceObject)[],
  options: TransformNodeOptions,
): Member[] {
  // parameters
  const paramType: Member[] = [];
  for (const paramIn of ["query", "header", "path", "cookie"] as ParameterObject["in"][]) {
    const paramLocType: Member[] = [];
    let operationParameters = parametersArray.map((param) => ({
      original: param,
      resolved: "$ref" in param ? options.ctx.resolve<ParameterObject>(param.$ref) : param,
    }));

    if (options.ctx.excludeDeprecated) {
      operationParameters = operationParameters.filter(
        ({ resolved }) => !resolved?.deprecated && !resolved?.schema?.deprecated,
      );
    }
    for (const { original, resolved } of operationParameters) {
      if (resolved?.in !== paramIn) {
        continue;
      }
      const subType =
        "$ref" in original
          ? oapiRef(original.$ref, resolved)
          : transformParameterObject(resolved as ParameterObject, {
              ...options,
              path: createRef([options.path, "parameters", resolved.in, resolved.name]),
            });
      const member: Member = {
        name: tsPropertyIndex(resolved?.name),
        optional: paramIn !== "path" && !(resolved as ParameterObject).required,
        type: subType,
      };
      addJSDocComment(resolved, member);
      paramLocType.push(member);
    }
    const allOptional = paramLocType.every((member) => member.optional);
    paramType.push({
      name: paramIn,
      optional: allOptional || !paramLocType.length,
      type: paramLocType.length ? { kind: "object", members: paramLocType } : NEVER,
    });
  }

  return [{ name: "parameters", type: { kind: "object", members: paramType } }];
}
