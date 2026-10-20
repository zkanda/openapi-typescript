// Stages each public package whose version changed in the last commit and isn't on npm yet.
// A maintainer then approves each staged version on npmjs.com (2FA).
//
// Uses `npm stage publish` directly: npm documents trusted publishing (OIDC) for it; pnpm doesn't.
// Packs with `vp pm pack` first so `workspace:` and `catalog:` ranges are resolved.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = process.env.STAGE_PUBLISH_BASE ?? "HEAD^";
const extraArgs = process.argv.slice(2); // e.g. --dry-run

// oxlint-disable-next-line no-console -- this is a script
const log = (msg) => console.log(msg);

function versionAt(rev, file) {
  try {
    return JSON.parse(execFileSync("git", ["show", `${rev}:${file}`], { encoding: "utf8" })).version;
  } catch {
    return undefined;
  }
}

async function isPublished(name, version) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`);
  return res.ok;
}

let staged = 0;
for (const dir of readdirSync("packages")) {
  const file = `packages/${dir}/package.json`;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const id = `${pkg.name}@${pkg.version}`;
  if (pkg.private) {
    continue;
  }
  // Re-runs on later pushes would fail: a staged version can't be staged again.
  if (versionAt(BASE, file) === pkg.version) {
    log(`skip ${id}: version unchanged since ${BASE}`);
    continue;
  }
  if (await isPublished(pkg.name, pkg.version)) {
    log(`skip ${id}: already published`);
    continue;
  }

  const dest = mkdtempSync(join(tmpdir(), "stage-publish-"));
  execFileSync("vp", ["pm", "pack", "--pack-destination", dest], { cwd: `packages/${dir}`, stdio: "inherit" });
  const tarball = resolve(
    dest,
    readdirSync(dest).find((f) => f.endsWith(".tgz")),
  );
  execFileSync("npm", ["stage", "publish", tarball, ...extraArgs], { stdio: "inherit" });
  log(`staged ${id}`);
  staged++;
}

log(staged ? `${staged} package(s) staged; approve them on npmjs.com` : "nothing to stage");
