#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import parser from "yargs-parser";
import openapiTS, { COMMENT_HEADER, c, error, formatTime } from "../dist/index.mjs";

const HELP = `Usage
  $ openapi-typescript [input] [options]

Options
  --help                     Display this
  --version                  Display the version
  --output, -o               Specify output file (default: stdout)
  --check                    Check that the generated types are up-to-date. (default: false)
  --additional-properties    Treat schema objects as if \`additionalProperties: true\` is set
  --empty-objects-unknown    Generate \`unknown\` instead of \`Record<string, never>\` for empty objects
  --default-non-nullable     Set to \`false\` to ignore default values when generating non-nullable types
  --properties-required-by-default
                             Treat schema objects as if \`required\` is set to all properties by default
  --exclude-deprecated       Exclude deprecated types
`;

const CWD = new URL(`file://${process.cwd()}/`);

const timeStart = performance.now();

const [, , ...args] = process.argv;

const BOOLEAN_FLAGS = [
  "additionalProperties",
  "check",
  "defaultNonNullable",
  "emptyObjectsUnknown",
  "excludeDeprecated",
  "help",
  "propertiesRequiredByDefault",
];

const flags = parser(args, {
  boolean: BOOLEAN_FLAGS,
  string: ["output"],
  alias: {
    output: ["o"],
  },
});

/** pretty-format error message but also throw */
function errorAndExit(message) {
  error(message);
  throw new Error(message);
}

async function main() {
  if ("help" in flags) {
    // biome-ignore lint/suspicious/noConsole: this is a CLI
    console.info(HELP);
    process.exit(0);
  }
  const packageJSON = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  if ("version" in flags) {
    // biome-ignore lint/suspicious/noConsole: this is a CLI
    console.info(`v${packageJSON.version}`);
    process.exit(0);
  }

  const toStdout = !flags.output;
  if (!toStdout) {
    // biome-ignore lint/suspicious/noConsole: this is a CLI
    console.info(`✨ ${c.bold(`openapi-typescript ${packageJSON.version}`)}`);
  }

  const input = flags._[0];
  if (typeof input === "string" && input.includes("*")) {
    errorAndExit("Globbing is not supported. Run openapi-typescript once per schema.");
  }

  // stdin or file/URL
  const source = input ? new URL(input, CWD) : process.stdin;
  const result = `${COMMENT_HEADER}${await openapiTS(source, { ...flags, silent: toStdout })}`;

  if (toStdout) {
    // if stdout, (still) don’t log anything to console!
    process.stdout.write(result);
    return;
  }

  const outFile = path.isAbsolute(flags.output) ? new URL(`file://${flags.output}`) : new URL(flags.output, CWD);
  if (flags.check) {
    if (fs.readFileSync(outFile, "utf8") === result) {
      process.exit(0);
    }
    error("Generated types are not up-to-date!");
    process.exit(1);
  }
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, result, "utf8");
  // biome-ignore lint/suspicious/noConsole: this is a CLI
  console.log(
    `🚀 ${c.green(`${input ?? "stdin"} → ${c.bold(flags.output)}`)} ${c.dim(`[${formatTime(performance.now() - timeStart)}]`)}`,
  );
}

main();
