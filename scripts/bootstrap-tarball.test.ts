import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_VERSION,
  assertBootstrapTarballEntries,
  createBootstrapTarballFromValidatedPack,
  listTarballEntries,
  parsePackTarballName,
} from "./lib/bootstrap-tarball.js";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function runValidatedPack(): string {
  execSync("npm run build", { cwd: REPO_ROOT, stdio: "pipe" });
  const packOutput = execSync("npm pack --ignore-scripts --loglevel error", {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarballName = parsePackTarballName(packOutput);
  return join(REPO_ROOT, tarballName);
}

describe("bootstrap tarball preflight", () => {
  it("rejects bare package/ directory entries (manual tar artifact)", () => {
    expect(() =>
      assertBootstrapTarballEntries(["package/", "package/package.json", "package/README.md"])
    ).toThrow(/package\/ \(directory entry package\/ \(trailing slash\)\)/);
  });

  it("rejects AppleDouble, tests, fixtures, and credentials", () => {
    expect(() => assertBootstrapTarballEntries(["package/._package.json"])).toThrow(/AppleDouble/);
    expect(() => assertBootstrapTarballEntries(["package/scripts/foo.test.ts"])).toThrow(/test files/);
    expect(() =>
      assertBootstrapTarballEntries(["package/scripts/fixtures/renovate-packets/x.yaml"])
    ).toThrow(/fixtures/);
    expect(() => assertBootstrapTarballEntries(["package/.env"])).toThrow(/credentials/);
  });

  it(
    "creates a 0.0.1 bootstrap tarball via npm pack (no bare package/ entry)",
    { timeout: 60_000 },
    () => {
      const validatedTarball = runValidatedPack();
      const outputDir = mkdtempSync(join(tmpdir(), "renovate-workflow-bootstrap-out-"));

      try {
        const { tarballPath, entries, manifest } = createBootstrapTarballFromValidatedPack(
          validatedTarball,
          { outputDir }
        );

        expect(existsSync(tarballPath)).toBe(true);
        expect(manifest.version).toBe(BOOTSTRAP_VERSION);
        expect(entries.some((entry) => entry === "package/")).toBe(false);
        expect(entries.some((entry) => entry.includes("/._"))).toBe(false);
        assertBootstrapTarballEntries(entries);

        const repackedEntries = listTarballEntries(tarballPath);
        expect(repackedEntries).toEqual(entries);
      } finally {
        rmSync(validatedTarball, { force: true });
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  );

  it(
    "manual tar -czf produces package/ entry that fails preflight",
    { timeout: 60_000 },
    () => {
      const validatedTarball = runValidatedPack();
      const workDir = mkdtempSync(join(tmpdir(), "renovate-workflow-manual-tar-"));

      try {
        const extractDir = join(workDir, "extract");
        const repackDir = join(workDir, "repack");
        execSync(`mkdir -p "${extractDir}" "${repackDir}/package"`);
        execSync(`tar -xzf "${validatedTarball}" -C "${extractDir}"`);
        execSync(`cp -a "${extractDir}/package/." "${repackDir}/package/"`);
        execSync(`npm pkg set version=${BOOTSTRAP_VERSION}`, {
          cwd: join(repackDir, "package"),
          stdio: "pipe",
        });

        const manualTarball = join(workDir, "manual-bootstrap.tgz");
        execSync(`tar -czf "${manualTarball}" -C "${repackDir}" package`);

        const entries = listTarballEntries(manualTarball);
        expect(entries).toContain("package/");
        expect(() => assertBootstrapTarballEntries(entries)).toThrow(/package\/ \(directory entry/);
      } finally {
        rmSync(validatedTarball, { force: true });
        rmSync(workDir, { recursive: true, force: true });
      }
    }
  );
});
