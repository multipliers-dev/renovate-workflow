import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..");

type PackResult = {
  tarballPath: string;
  manifest: { name: string; version: string };
  entries: string[];
};

function parsePackedTarballName(packOutput: string): string {
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

function removePackTree(tarballPath: string): void {
  rmSync(dirname(tarballPath), { recursive: true, force: true });
}

function runPack(): PackResult {
  execSync("npm run build", { cwd: REPO_ROOT, stdio: "pipe" });
  const packDir = mkdtempSync(join(tmpdir(), "renovate-workflow-pack-manifest-"));
  const packOutput = execSync(
    `npm pack --ignore-scripts --loglevel error --pack-destination "${packDir}"`,
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const tarballName = parsePackedTarballName(packOutput);
  const tarballPath = join(packDir, tarballName);
  const entries = execSync(`tar -tzf "${tarballPath}"`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  const manifest = JSON.parse(
    execSync(`tar -xOf "${tarballPath}" package/package.json`, { encoding: "utf8" })
  ) as { name: string; version: string };
  return { tarballPath, manifest, entries };
}

function installPackedArtifactOnly(tarballPath: string): string {
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
  it("release manifest ships scoped name 0.3.0, dist, and README only", () => {
    const { tarballPath, manifest, entries } = runPack();

    expect(manifest.name).toBe("@multipliers-dev/renovate-workflow");
    expect(manifest.version).toBe("0.3.0");

    const normalized = entries.map((entry) => entry.replace(/^package\//, ""));
    expect(normalized.some((entry) => entry.startsWith("dist/cli.js"))).toBe(true);
    expect(normalized).toContain("README.md");
    expect(normalized.some((entry) => entry.startsWith("scripts/"))).toBe(false);
    expect(normalized.some((entry) => entry.startsWith("skills/"))).toBe(false);
    expect(normalized.some((entry) => entry.startsWith(".agents/"))).toBe(false);
    expect(normalized.some((entry) => entry.endsWith(".test.ts"))).toBe(false);

    removePackTree(tarballPath);
  });

  it("packed artifact CLI runs renovate-workflow freshness-poll --help", { timeout: 60_000 }, () => {
    const { tarballPath } = runPack();
    const installDir = installPackedArtifactOnly(tarballPath);

    try {
      const binPath = join(installDir, "node_modules", ".bin", "renovate-workflow");
      expect(existsSync(binPath)).toBe(true);

      const { status, stderr, stdout } = spawnSync(binPath, ["freshness-poll", "--help"], {
        cwd: installDir,
        encoding: "utf8",
      });
      expectHelpOutput(status, stderr, stdout);
    } finally {
      removePackTree(tarballPath);
      rmSync(installDir, { recursive: true, force: true });
    }
  });
});
