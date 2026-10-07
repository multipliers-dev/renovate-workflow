import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

function runPack(): PackResult {
  execSync("npm run build", { cwd: REPO_ROOT, stdio: "pipe" });
  const packOutput = execSync("npm pack --ignore-scripts --loglevel error", {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarballName = parsePackedTarballName(packOutput);
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

function installPackedArtifactOnly(tarballPath: string): string {
  const installDir = mkdtempSync(join(tmpdir(), "renovate-workflow-pack-"));
  execSync(`npm install --no-save "${tarballPath}"`, {
    cwd: installDir,
    stdio: "pipe",
  });
  return installDir;
}

function installLegacyConsumerPackage(tarballPath: string): string {
  const consumerDir = mkdtempSync(join(tmpdir(), "renovate-workflow-legacy-consumer-"));
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "legacy-consumer-smoke",
        private: true,
        type: "module",
        devDependencies: {
          "renovate-workflow": `file:${tarballPath}`,
          tsx: "^4.23.15",
        },
      },
      null,
      2
    )
  );
  execSync("npm install", { cwd: consumerDir, stdio: "pipe" });
  return consumerDir;
}

function expectHelpOutput(status: number | null, stderr: string, stdout: string): void {
  expect(status).toBe(0);
  const output = `${stdout}${stderr}`;
  expect(output).toContain("--repo");
  expect(output).toContain("--expected-head");
}

describe("npm pack manifest", () => {
  it("ships dist, legacy scripts compatibility paths, README, and unscoped name", () => {
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
      rmSync(tarballPath, { force: true });
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it(
    "legacy consumer package layout runs tsx on packaged scripts/renovate-freshness-poll.ts --help",
    { timeout: 120_000 },
    () => {
      const { tarballPath } = runPack();
      const consumerDir = installLegacyConsumerPackage(tarballPath);

      try {
        const tsxPath = join(consumerDir, "node_modules", ".bin", "tsx");
        const legacyScript = join(
          consumerDir,
          "node_modules",
          "renovate-workflow",
          "scripts",
          "renovate-freshness-poll.ts"
        );
        expect(existsSync(tsxPath)).toBe(true);
        expect(readFileSync(legacyScript, "utf8")).toContain("parseRenovateFreshnessPollArgs");

        const { status, stderr, stdout } = spawnSync(
          tsxPath,
          ["node_modules/renovate-workflow/scripts/renovate-freshness-poll.ts", "--help"],
          { cwd: consumerDir, encoding: "utf8" }
        );
        expectHelpOutput(status, stderr, stdout);
      } finally {
        rmSync(tarballPath, { force: true });
        rmSync(consumerDir, { recursive: true, force: true });
      }
    }
  );
});
