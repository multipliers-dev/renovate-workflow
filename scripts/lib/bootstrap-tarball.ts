import { execSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const BOOTSTRAP_VERSION = "0.0.1";

const FORBIDDEN_ENTRY_PATTERNS: Array<{ label: string; test: (entry: string) => boolean }> = [
  {
    label: "directory entry package/ (trailing slash)",
    test: (entry) => entry === "package/" || entry === "package",
  },
  {
    label: "AppleDouble (._*)",
    test: (entry) => /(^|\/)\._[^/]+/.test(entry),
  },
  {
    label: ".git",
    test: (entry) => entry.includes(".git"),
  },
  {
    label: "test files",
    test: (entry) => entry.endsWith(".test.ts") || entry.endsWith(".test.js"),
  },
  {
    label: "fixtures",
    test: (entry) => entry.includes("/fixtures/"),
  },
  {
    label: "credentials",
    test: (entry) =>
      /(^|\/)\.env($|\.)/.test(entry) ||
      entry.includes("credentials.json") ||
      entry.includes("id_rsa"),
  },
];

export function listTarballEntries(tarballPath: string): string[] {
  const listing = execSync(`tar -tzf "${tarballPath}"`, { encoding: "utf8" });
  return listing
    .trim()
    .split("\n")
    .filter(Boolean);
}

export function readPackedManifest(tarballPath: string): { name: string; version: string } {
  const raw = execSync(`tar -xOf "${tarballPath}" package/package.json`, { encoding: "utf8" });
  return JSON.parse(raw) as { name: string; version: string };
}

export function parsePackTarballName(packOutput: string): string {
  const tarballName = packOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .at(-1);
  if (!tarballName) {
    throw new Error(`npm pack did not report a .tgz filename:\n${packOutput}`);
  }
  return tarballName;
}

export function assertBootstrapTarballEntries(entries: string[]): void {
  const violations: string[] = [];

  for (const entry of entries) {
    for (const pattern of FORBIDDEN_ENTRY_PATTERNS) {
      if (pattern.test(entry)) {
        violations.push(`${entry} (${pattern.label})`);
        break;
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `bootstrap tarball failed preflight:\n${violations.map((v) => `  - ${v}`).join("\n")}`
    );
  }

  const normalized = entries.map((entry) => entry.replace(/^package\//, ""));
  if (!normalized.some((entry) => entry.startsWith("dist/"))) {
    throw new Error("bootstrap tarball missing dist/ publish surface");
  }
  if (!normalized.includes("package.json")) {
    throw new Error("bootstrap tarball missing package/package.json");
  }
  if (!normalized.includes("README.md")) {
    throw new Error("bootstrap tarball missing package/README.md");
  }
}

export type BootstrapTarballResult = {
  tarballPath: string;
  entries: string[];
  manifest: { name: string; version: string };
};

/**
 * Build a disposable bootstrap tarball from an already-validated `npm pack` artifact.
 *
 * Uses `npm pack --ignore-scripts` in an isolated temp directory so the tarball
 * matches libnpmpack layout (file entries only under package/..., no bare package/
 * directory entry). Manual `tar -czf` is rejected by the npm registry (E415 invalid
 * path: package/) because BSD tar emits a trailing-slash directory entry.
 */
export function createBootstrapTarballFromValidatedPack(
  validatedTarballPath: string,
  options: { outputDir?: string; keepWorkdirs?: boolean } = {}
): BootstrapTarballResult {
  const absoluteValidated = resolve(validatedTarballPath);
  if (!existsSync(absoluteValidated)) {
    throw new Error(`validated pack tarball not found: ${absoluteValidated}`);
  }

  const workRoot = mkdtempSync(join(tmpdir(), "renovate-workflow-bootstrap-"));
  const extractDir = join(workRoot, "extract");
  const isolatedPackageDir = join(workRoot, "isolated-package");
  const outputDir = options.outputDir ? resolve(options.outputDir) : workRoot;

  try {
    mkdirSync(extractDir, { recursive: true });
    cpSync(absoluteValidated, join(workRoot, "validated.tgz"));
    execSync(`tar -xzf "${join(workRoot, "validated.tgz")}" -C "${extractDir}"`, {
      stdio: "pipe",
    });

    const extractedPackageDir = join(extractDir, "package");
    if (!existsSync(join(extractedPackageDir, "package.json"))) {
      throw new Error("validated pack tarball missing package/package.json");
    }

    cpSync(extractedPackageDir, isolatedPackageDir, { recursive: true });
    execSync(`npm pkg set version=${BOOTSTRAP_VERSION}`, {
      cwd: isolatedPackageDir,
      stdio: "pipe",
    });

    const packOutput = execSync("npm pack --ignore-scripts --loglevel error", {
      cwd: isolatedPackageDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const packedName = parsePackTarballName(packOutput);
    const packedPath = join(isolatedPackageDir, packedName);
    const finalPath = join(outputDir, packedName);

    copyFileSync(packedPath, finalPath);

    const entries = listTarballEntries(finalPath);
    assertBootstrapTarballEntries(entries);
    const manifest = readPackedManifest(finalPath);

    if (manifest.version !== BOOTSTRAP_VERSION) {
      throw new Error(
        `bootstrap tarball version must be ${BOOTSTRAP_VERSION}, got ${manifest.version}`
      );
    }

    return { tarballPath: finalPath, entries, manifest };
  } finally {
    if (!options.keepWorkdirs) {
      rmSync(workRoot, { recursive: true, force: true });
    }
  }
}

export function packValidatedReleaseArtifact(repoRoot: string): string {
  const packOutput = execSync("npm pack --ignore-scripts --loglevel error", {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarballName = parsePackTarballName(packOutput);
  return join(repoRoot, tarballName);
}

export function assertCheckoutVersion(repoRoot: string, expectedVersion: string): void {
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8")
  ) as { version: string };
  if (manifest.version !== expectedVersion) {
    throw new Error(`Expected package version ${expectedVersion}, got ${manifest.version}`);
  }
}
