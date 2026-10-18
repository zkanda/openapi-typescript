import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import type { TestCase } from "./test-helpers.js";

const root = new URL("../", import.meta.url);
const cwd = os.platform() === "win32" ? fileURLToPath(root) : root; // execa bug: fileURLToPath required on Windows
const cmd = "./bin/cli.js";
const TIMEOUT = 90_000;

describe("CLI", () => {
  const tests: TestCase<any, any>[] = [
    [
      "snapshot > GitHub API",
      {
        given: ["./examples/github-api.yaml"],
        want: new URL("./examples/github-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > GitHub API (next)",
      {
        given: ["./examples/github-api-next.yaml"],
        want: new URL("./examples/github-api-next.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > Octokit GHES 3.6 Diff to API",
      {
        given: ["./examples/octokit-ghes-3.6-diff-to-api.json"],
        want: new URL("./examples/octokit-ghes-3.6-diff-to-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > Stripe API",
      {
        given: ["./examples/stripe-api.yaml"],
        want: new URL("./examples/stripe-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > DigitalOcean",
      {
        given: ["./examples/digital-ocean-api/DigitalOcean-public.v2.yaml"],
        want: new URL("./examples/digital-ocean-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
  ];

  for (const [testName, { given, want, ci }] of tests) {
    test.skipIf(ci?.skipIf)(
      testName,
      async () => {
        const { stdout } = await execa(cmd, given, { cwd, stripFinalNewline: false });
        if (want instanceof URL) {
          await expect(stdout).toMatchFileSnapshot(fileURLToPath(want));
        } else {
          expect(stdout).toBe(`${want}\n`);
        }
      },
      ci?.timeout,
    );
  }

  test(
    "stdin",
    async () => {
      const input = fs.readFileSync(new URL("./examples/stripe-api.yaml", root));
      const { stdout } = await execa(cmd, { input, cwd, stripFinalNewline: false });
      await expect(stdout).toMatchFileSnapshot(fileURLToPath(new URL("./examples/stripe-api.ts", root)));
    },
    TIMEOUT,
  );

  describe("flags", () => {
    test("--help", async () => {
      const { stdout } = await execa(cmd, ["--help"], { cwd });
      expect(stdout).toEqual(expect.stringMatching(/^Usage\n\s+\$ openapi-typescript \[input\] \[options\]/));
    });

    test("--version", async () => {
      const { stdout } = await execa(cmd, ["--version"], { cwd });
      expect(stdout).toEqual(expect.stringMatching(/^v[\d.]+(-.*)?$/));
    });

    test(
      "--properties-required-by-default",
      async () => {
        const { stdout } = await execa(cmd, ["--properties-required-by-default=true", "./examples/github-api.yaml"], {
          cwd,
          stripFinalNewline: false,
        });
        await expect(stdout).toMatchFileSnapshot(fileURLToPath(new URL("./examples/github-api-required.ts", root)));
      },
      TIMEOUT,
    );
  });
});
