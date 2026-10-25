#!/usr/bin/env node
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLegacyShimInSync,
  resolveLegacyShimPaths,
  syncLegacySkillShim,
} from "./lib/legacy-skill-shim.js";

const REPO_ROOT = join(import.meta.dirname, "..");

function printUsage(): void {
  console.error(`Usage: npm run sync:legacy-skill-shim [--check]

Copy canonical ${"skills/"} into ${".cursor/skills/"} for hosts that still fetch skill bodies from the pre–0.2.0 path.

Options:
  --check   Verify shim matches canonical tree (exit 1 on drift); do not write
  --help    Show this help
`);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const paths = resolveLegacyShimPaths(REPO_ROOT);

  if (args.includes("--check")) {
    assertLegacyShimInSync(paths);
    console.log("Legacy skill shim is in sync with skills/");
    return;
  }

  if (args.length > 0) {
    throw new Error(`unknown arguments: ${args.join(" ")}`);
  }

  const result = syncLegacySkillShim(paths);
  assertLegacyShimInSync(paths);
  console.log(
    `Synced ${result.filesCopied} file(s) across ${result.skillNames.length} skill(s) → ${".cursor/skills/"}`,
  );
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
