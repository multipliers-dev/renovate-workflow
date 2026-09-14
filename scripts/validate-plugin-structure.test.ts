import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
  ) as { version: string };
  return packageJson.version;
}

/** Closed Agent Plugins 1.0 portable manifest top-level fields (§5.2). */
const PORTABLE_PLUGIN_TOP_LEVEL_KEYS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

describe("validate-plugin-structure", () => {
  const packageVersion = readPackageVersion();

  it("root plugin.json uses only Agent Plugins 1.0 portable top-level fields", () => {
    const manifestPath = join(REPO_ROOT, "plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;

    expect(manifest.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
    expect(manifest.name).toBe("renovate-workflow");
    expect(manifest.version).toBe(packageVersion);

    const keys = Object.keys(manifest);
    for (const key of keys) {
      expect(PORTABLE_PLUGIN_TOP_LEVEL_KEYS.has(key)).toBe(true);
    }

    // Component paths belong in .cursor-plugin/plugin.json, not the portable manifest.
    expect(manifest).not.toHaveProperty("skills");
    expect(manifest).not.toHaveProperty("agents");
  });

  it("skills live at the Agent Plugins 1.0 fixed location", () => {
    const skillNames = [
      "renovate-classifier",
      "renovate-loop",
      "renovate-investigator",
      "renovate-maintainer",
      "renovate-draft-readiness",
    ];

    for (const skillName of skillNames) {
      const skillPath = join(REPO_ROOT, "skills", skillName, "SKILL.md");
      expect(readFileSync(skillPath, "utf8").length).toBeGreaterThan(0);
    }
  });

  it(".cursor-plugin/plugin.json points skills and agents at repo paths", () => {
    const manifestPath = join(REPO_ROOT, ".cursor-plugin", "plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;

    expect(manifest.version).toBe(packageVersion);
    expect(manifest.skills).toBe("./skills");
    expect(manifest.agents).toBe("./.agents");
  });
});
