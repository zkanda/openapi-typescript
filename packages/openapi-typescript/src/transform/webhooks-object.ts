import { type Member, type TypeNode, tsPropertyIndex } from "../lib/ts.js";
import { createRef, getEntries } from "../lib/utils.js";
import type { GlobalContext, WebhooksObject } from "../types.js";
import transformPathItemObject from "./path-item-object.js";

export default function transformWebhooksObject(webhooksObject: WebhooksObject, options: GlobalContext): TypeNode {
  const members: Member[] = [];

  for (const [name, pathItemObject] of getEntries(webhooksObject, options)) {
    members.push({
      name: tsPropertyIndex(name),
      type: transformPathItemObject(pathItemObject, {
        path: createRef(["webhooks", name]),
        ctx: options,
      }),
    });
  }

  return { kind: "object", members };
}
