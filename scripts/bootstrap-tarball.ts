#!/usr/bin/env node
/**
 * Build and preflight-inspect the disposable bootstrap tarball (0.0.1) from a
 * validated 0.3.0 npm pack artifact. Does not call npm stage publish.
 *
 * Usage:
 *   tsx scripts/bootstrap-tarball.ts [--from-tarball path.tgz] [--output-dir dir]
 *
 * Prints the absolute path to the bootstrap .tgz on stdout (last line).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertCheckoutVersion,
  createBootstrapTarballFromValidatedPack,
  packValidatedReleaseArtifact,
  removePackedArtifactTree,
} from "./lib/bootstrap-tarball.js";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CANONICAL_VERSION = "0.3.0";

function parseArgs(argv: string[]): { fromTarball?: string; outputDir?: string } {
  const options: { fromTarball?: string; outputDir?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--from-tarball") {
      options.fromTarball = argv[++i];
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = argv[++i];
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: tsx scripts/bootstrap-tarball.ts [--from-tarball path.tgz] [--output-dir dir]`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  assertCheckoutVersion(REPO_ROOT, CANONICAL_VERSION);

  let validatedTarball = options.fromTarball ? resolve(options.fromTarball) : undefined;
  let createdValidatedTarball = false;

  if (!validatedTarball) {
    validatedTarball = packValidatedReleaseArtifact(REPO_ROOT);
    createdValidatedTarball = true;
  } else if (!existsSync(validatedTarball)) {
    throw new Error(`--from-tarball not found: ${validatedTarball}`);
  }

  try {
    const { tarballPath, manifest } = createBootstrapTarballFromValidatedPack(validatedTarball, {
      outputDir: options.outputDir,
    });
    console.error(
      `bootstrap tarball preflight OK: ${manifest.name}@${manifest.version} -> ${tarballPath}`
    );
    console.log(tarballPath);
  } finally {
    if (createdValidatedTarball && validatedTarball) {
      removePackedArtifactTree(validatedTarball);
    }
  }
}

main();
