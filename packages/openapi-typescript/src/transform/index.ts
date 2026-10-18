import { performance } from "node:perf_hooks";
import { NEVER, type Node, STRING, tsRecord } from "../lib/ts.js";
import { createRef, debug } from "../lib/utils.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";
import transformComponentsObject from "./components-object.js";
import transformPathsObject from "./paths-object.js";
import transformSchemaObject from "./schema-object.js";
import transformWebhooksObject from "./webhooks-object.js";

type SchemaTransforms = keyof Pick<OpenAPI3, "paths" | "webhooks" | "components" | "$defs">;

const transformers: Record<SchemaTransforms, (node: any, options: GlobalContext) => Node> = {
  paths: transformPathsObject,
  webhooks: transformWebhooksObject,
  components: transformComponentsObject,
  $defs: (node, options) => transformSchemaObject(node, { path: createRef(["$defs"]), ctx: options, schema: node }),
};

export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext): Node[] {
  const type: Node[] = [];

  for (const root of Object.keys(transformers) as SchemaTransforms[]) {
    const emptyObj: Node = { kind: "alias", name: root, type: tsRecord(STRING, NEVER) };

    if (schema[root] && typeof schema[root] === "object") {
      const rootT = performance.now();
      const subType = transformers[root](schema[root], ctx);
      if (subType.kind === "object" && subType.members.length) {
        type.push({ kind: "interface", name: root, members: subType.members });
        debug(`${root} done`, "ts", performance.now() - rootT);
      } else {
        type.push(emptyObj);
        debug(`${root} done (skipped)`, "ts", 0);
      }
    } else {
      type.push(emptyObj);
      debug(`${root} done (skipped)`, "ts", 0);
    }
  }

  // inject
  type.push(...ctx.injectFooter);
  if (!ctx.injectFooter.some((node) => node.kind === "interface" && node.name === "operations")) {
    // if no operations created, inject empty operations type
    type.push({ kind: "alias", name: "operations", type: tsRecord(STRING, NEVER) });
  }

  return type;
}
