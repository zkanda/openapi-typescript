/**
 * Type-checks everything astToString() prints during a test file.
 *
 * Unit tests compare output strings, which proves the printer is stable but not
 * that its output is valid TypeScript. This setup file records each printed
 * node, wraps it into a module (a type fragment becomes `type T = …;`, a
 * member becomes `type T = { … };`), and runs `tsc` over all of them after the
 * file’s tests finish. Names the generated document would declare
 * (`components`, `paths`, …) are stubbed, since fragments reference them.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import type { Member, Node } from "../src/lib/ts.js";

const printed = vi.hoisted(() => [] as string[]);

vi.mock("../src/lib/ts.js", async (importOriginal) => {
  const ts = await importOriginal<typeof import("../src/lib/ts.js")>();
  return {
    ...ts,
    astToString(ast: Node | Member | (Node | Member)[]): string {
      for (const node of Array.isArray(ast) ? ast : [ast]) {
        const text = ts.astToString(node);
        if (!("kind" in node)) {
          printed.push(`type T = {\n${text}};\n`);
        } else if (node.kind === "interface" || node.kind === "alias" || node.kind === "raw") {
          printed.push(text);
        } else {
          printed.push(`type T = ${text.trimEnd()};\n`);
        }
      }
      return ts.astToString(ast);
    },
  };
});

const STUBS = `type components = any;
type paths = any;
type operations = any;
type webhooks = any;
type $defs = any;
type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
`;

const TSCONFIG = {
  compilerOptions: {
    lib: ["ESNext", "DOM"],
    module: "ESNext",
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: "ESNext",
    types: [],
  },
  include: ["*.ts"],
};

const cwd = fileURLToPath(new URL("..", import.meta.url));

afterAll(async () => {
  if (!printed.length) {
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-ts-typecheck-"));
  try {
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify(TSCONFIG));
    fs.writeFileSync(path.join(dir, "stubs.d.ts"), STUBS);
    for (const [i, source] of printed.entries()) {
      // `export {}` makes each file a module, so declarations don’t collide
      fs.writeFileSync(path.join(dir, `output-${i}.ts`), `export {};\n${source}`);
    }
    const { exitCode, stdout } = await execa("tsc", ["-p", dir, "--pretty", "false"], {
      cwd,
      preferLocal: true,
      reject: false,
    });
    if (exitCode !== 0) {
      const files = new Set([...stdout.matchAll(/(output-\d+\.ts)\(/g)].map((m) => m[1]));
      const sources = [...files].map((f) => `--- ${f}\n${fs.readFileSync(path.join(dir, f), "utf8")}`);
      throw new Error(`Printed output is not valid TypeScript:\n${stdout}\n\n${sources.join("\n")}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
