import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_SKILLS_DIR,
  LEGACY_SKILLS_DIR,
  assertLegacyShimInSync,
  findLegacyShimDrift,
  resolveLegacyShimPaths,
  syncLegacySkillShim,
} from "./lib/legacy-skill-shim.js";

const REPO_ROOT = join(import.meta.dirname, "..");

describe("legacy skill shim", () => {
  const paths = resolveLegacyShimPaths(REPO_ROOT);

  it("repo ships all five renovate-* skills at canonical and legacy paths", () => {
    const expected = [
      "renovate-classifier",
      "renovate-loop",
      "renovate-investigator",
      "renovate-maintainer",
      "renovate-draft-readiness",
    ];
    for (const skillName of expected) {
      expect(
        readFileSync(
          join(REPO_ROOT, CANONICAL_SKILLS_DIR, skillName, "SKILL.md"),
          "utf8",
        ).length,
      ).toBeGreaterThan(0);
    }
    assertLegacyShimInSync(paths);
    const drifts = findLegacyShimDrift(paths);
    expect(drifts).toHaveLength(0);
  });

  it("legacy .cursor/skills tree matches canonical skills/ byte-for-byte", () => {
    assertLegacyShimInSync(paths);
  });

  it("detects orphan legacy skill dir after canonical skill removal", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "legacy-shim-orphan-"));
    try {
      const canonical = join(tempRoot, CANONICAL_SKILLS_DIR, "demo-skill");
      mkdirSync(canonical, { recursive: true });
      writeFileSync(join(canonical, "SKILL.md"), "# demo\n", "utf8");

      const tempPaths = resolveLegacyShimPaths(tempRoot);
      syncLegacySkillShim(tempPaths);

      rmSync(canonical, { recursive: true, force: true });
      const drifts = findLegacyShimDrift(tempPaths);
      expect(drifts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            skill: "demo-skill",
            relativePath: "(entire skill tree)",
            reason: "extra_legacy",
          }),
        ]),
      );
      expect(() => assertLegacyShimInSync(tempPaths)).toThrow(
        /sync:legacy-skill-shim/,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("detects content drift after canonical edit without re-sync", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "legacy-shim-test-"));
    try {
      const canonical = join(tempRoot, CANONICAL_SKILLS_DIR, "demo-skill");
      mkdirSync(canonical, { recursive: true });
      writeFileSync(join(canonical, "SKILL.md"), "# demo\n", "utf8");

      const tempPaths = resolveLegacyShimPaths(tempRoot);
      syncLegacySkillShim(tempPaths);

      writeFileSync(join(canonical, "SKILL.md"), "# demo changed\n", "utf8");
      const drifts = findLegacyShimDrift(tempPaths);
      expect(drifts.some((d) => d.reason === "content_mismatch")).toBe(true);
      expect(() => assertLegacyShimInSync(tempPaths)).toThrow(
        /sync:legacy-skill-shim/,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("legacy SKILL.md paths exist for GitHub Contents layout", () => {
    const skillNames = [
      "renovate-classifier",
      "renovate-loop",
      "renovate-investigator",
      "renovate-maintainer",
      "renovate-draft-readiness",
    ];
    for (const skillName of skillNames) {
      const legacySkillMd = join(REPO_ROOT, LEGACY_SKILLS_DIR, skillName, "SKILL.md");
      const canonicalSkillMd = join(
        REPO_ROOT,
        CANONICAL_SKILLS_DIR,
        skillName,
        "SKILL.md",
      );
      expect(readFileSync(legacySkillMd, "utf8")).toBe(
        readFileSync(canonicalSkillMd, "utf8"),
      );
    }
  });
});
