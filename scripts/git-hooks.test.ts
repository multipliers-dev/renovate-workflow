import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd());
const prepareGitHooks = join(repoRoot, "scripts/prepare-git-hooks.sh");
const verifyGitHooks = join(repoRoot, "scripts/verify-git-hooks.sh");
const huskyShimRepair = join(repoRoot, "scripts/husky-shim-repair.sh");
const ensureHooks = join(repoRoot, "scripts/ensure-hooks.sh");
const sessionEnsureScript = join(repoRoot, "scripts/session-ensure-git-hooks.sh");
const sessionEnsure = join(repoRoot, ".cursor/hooks/ensure-git-hooks.sh");
const environmentJson = join(repoRoot, ".cursor/environment.json");

function expectExecutable(path: string): void {
  expect(
    statSync(path).mode & 0o111,
    `${path} must be executable`,
  ).toBeTruthy();
}

function envWithoutGit(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  return env;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Layer 1 git hooks", () => {
  it("keeps portable scripts executable", () => {
    expectExecutable(prepareGitHooks);
    expectExecutable(verifyGitHooks);
    expectExecutable(huskyShimRepair);
    expectExecutable(ensureHooks);
    expectExecutable(sessionEnsureScript);
    expectExecutable(sessionEnsure);
  });

  it("environment.json uses blocking ensure-hooks wait on start (no cloud-agent Node wrapper)", () => {
    const env = JSON.parse(readFileSync(environmentJson, "utf8")) as {
      install: string;
      start: string;
    };
    expect(env.install).toBe("npm ci");
    expect(env.start).toContain("ENSURE_HOOKS_MODE=wait");
    expect(env.start).toContain("scripts/ensure-hooks.sh");
    expect(env.start).not.toContain("cloud-agent");
  });

  it("ensure-hooks documents ENSURE_HOOKS_MODE wait/require fail-closed", () => {
    const src = readFileSync(ensureHooks, "utf8");
    expect(src).toContain("ENSURE_HOOKS_MODE");
    expect(src).toContain("wait");
    expect(src).toContain("require");
    expect(src).toContain("refusing silent skip");
  });

  it("prepare runs ensure-hooks last even when verify fails", () => {
    const src = readFileSync(prepareGitHooks, "utf8");
    expect(src).toContain("ensure-hooks.sh");
    expect(src).toContain("ensure_status");
  });

  it("sessionStart hook matches session-ensure-git-hooks.sh primitive", () => {
    expect(readFileSync(sessionEnsure, "utf8")).toBe(
      readFileSync(sessionEnsureScript, "utf8"),
    );
  });

  it("prepare sources the shared shim repair helper", () => {
    const src = readFileSync(prepareGitHooks, "utf8");
    expect(src).toContain("husky-shim-repair.sh");
    expect(src).toContain("attempt_husky_shim_repair");
  });

  it("sessionStart documents fail-open warnings", () => {
    const src = readFileSync(sessionEnsure, "utf8");
    expect(src).toContain("HOOKS NOT RUNNABLE");
    expect(src).toContain("HOOKS BRIDGE NOT LIVE");
  });

  it("verify fails in a checkout without executable shims", () => {
    const dir = mkdtempSync(join(tmpdir(), "hooks-verify-"));
    tempDirs.push(dir);
    const gitInit = spawnSync("git", ["init"], {
      cwd: dir,
      encoding: "utf8",
      env: envWithoutGit(),
    });
    expect(gitInit.status).toBe(0);
    mkdirSync(join(dir, ".husky"));
    writeFileSync(join(dir, ".husky/pre-commit"), "#!/bin/sh\n");

    const result = spawnSync("sh", [verifyGitHooks], {
      cwd: dir,
      encoding: "utf8",
      env: envWithoutGit(),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("npm run prepare");
  });

  it("sessionStart is fail-open and warns when shims are missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "hooks-session-"));
    tempDirs.push(dir);
    const gitInit = spawnSync("git", ["init"], {
      cwd: dir,
      encoding: "utf8",
      env: envWithoutGit({ HOME: dir }),
    });
    expect(gitInit.status).toBe(0);
    mkdirSync(join(dir, ".husky"));
    writeFileSync(join(dir, ".husky/pre-commit"), "#!/bin/sh\n");
    mkdirSync(join(dir, "scripts"));
    writeFileSync(
      join(dir, "scripts/verify-git-hooks.sh"),
      readFileSync(verifyGitHooks),
    );

    const result = spawnSync("sh", [sessionEnsure], {
      cwd: dir,
      encoding: "utf8",
      env: envWithoutGit({ HOME: dir }),
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("HOOKS NOT RUNNABLE");
  });
});
