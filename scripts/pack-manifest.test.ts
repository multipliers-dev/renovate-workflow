import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..");

type PackResult = {
  tarballPath: string;
  manifest: { name: string; version: string };
  entries: string[];
};

function runPack(): PackResult {
  execSync("npm run build", { cwd: REPO_ROOT, stdio: "pipe" });
  const tarballName = execSync("npm pack --ignore-scripts", {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const tarballPath = join(REPO_ROOT, tarballName);
  const entries = execSync(`tar -tzf "${tarballPath}"`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  const manifest = JSON.parse(
    execSync(`tar -xOf "${tarballPath}" package/package.json`, { encoding: "utf8" })
  ) as { name: string; version: string };
  return { tarballPath, manifest, entries };
}

function installPackedTarball(tarballPath: string): string {
  const installDir = mkdtempSync(join(tmpdir(), "renovate-workflow-pack-"));
  execSync(`npm install --no-save "${tarballPath}"`, {
    cwd: installDir,
    stdio: "pipe",
  });
  return installDir;
}

function expectHelpOutput(status: number | null, stderr: string, stdout: string): void {
  expect(status).toBe(0);
  const output = `${stdout}${stderr}`;
  expect(output).toContain("--repo");
  expect(output).toContain("--expected-head");
}

describe("npm pack manifest", () => {
  it("ships dist, legacy scripts runtime paths, README, and unscoped name", () => {
    const { tarballPath, manifest, entries } = runPack();

    expect(manifest.name).toBe("renovate-workflow");

    const normalized = entries.map((entry) => entry.replace(/^package\//, ""));
    expect(normalized.some((entry) => entry.startsWith("dist/cli.js"))).toBe(true);
    expect(normalized).toContain("scripts/renovate-freshness-poll.ts");
    expect(normalized).toContain("scripts/lib/renovate-freshness-poll.ts");
    expect(normalized).toContain("README.md");
    expect(normalized.some((entry) => entry.startsWith("skills/"))).toBe(false);
    expect(normalized.some((entry) => entry.startsWith(".agents/"))).toBe(false);
    expect(normalized.some((entry) => entry.endsWith(".test.ts"))).toBe(false);
    expect(normalized.some((entry) => entry.startsWith("scripts/fixtures/"))).toBe(false);

    rmSync(tarballPath, { force: true });
  });

  it("packed CLI runs freshness-poll --help", () => {
    const { tarballPath } = runPack();
    const installDir = installPackedTarball(tarballPath);

    try {
      const binPath = join(installDir, "node_modules", ".bin", "renovate-workflow");
      expect(existsSync(binPath)).toBe(true);

      const { status, stderr, stdout } = spawnSync(binPath, ["freshness-poll", "--help"], {
        cwd: installDir,
        encoding: "utf8",
      });
      expectHelpOutput(status, stderr, stdout);
    } finally {
      rmSync(tarballPath, { force: true });
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("legacy git-layout path runs tsx scripts/renovate-freshness-poll.ts --help", () => {
    const { tarballPath } = runPack();
    const installDir = installPackedTarball(tarballPath);
    const tsxPath = join(REPO_ROOT, "node_modules", ".bin", "tsx");

    try {
      const legacyScript = join(
        installDir,
        "node_modules",
        "renovate-workflow",
        "scripts",
        "renovate-freshness-poll.ts"
      );
      expect(readFileSync(legacyScript, "utf8")).toContain("parseRenovateFreshnessPollArgs");
      expect(existsSync(tsxPath)).toBe(true);

      const { status, stderr, stdout } = spawnSync(tsxPath, [legacyScript, "--help"], {
        cwd: installDir,
        encoding: "utf8",
      });
      expectHelpOutput(status, stderr, stdout);
    } finally {
      rmSync(tarballPath, { force: true });
      rmSync(installDir, { recursive: true, force: true });
    }
  });
});
