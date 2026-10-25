import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, relative } from "node:path";

/** Agent Plugins 1.0 canonical skill tree (single source of truth). */
export const CANONICAL_SKILLS_DIR = "skills";

/**
 * Legacy Cursor skill body fetch path (pre–0.2.0). Some hosts still request
 * `.cursor/skills/<name>/SKILL.md` via GitHub Contents even when discovery
 * reports `skills/…`. Generated copies only — never edit by hand.
 */
export const LEGACY_SKILLS_DIR = join(".cursor", "skills");

export type LegacyShimPaths = {
  repoRoot: string;
  canonicalDir: string;
  legacyDir: string;
};

export function resolveLegacyShimPaths(repoRoot: string): LegacyShimPaths {
  return {
    repoRoot,
    canonicalDir: join(repoRoot, CANONICAL_SKILLS_DIR),
    legacyDir: join(repoRoot, LEGACY_SKILLS_DIR),
  };
}

function listSkillNames(skillsDir: string, label: string): string[] {
  if (!existsSync(skillsDir)) {
    if (label === "canonical") {
      throw new Error(`canonical skills directory missing: ${skillsDir}`);
    }
    return [];
  }
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listCanonicalSkillNames(canonicalDir: string): string[] {
  return listSkillNames(canonicalDir, "canonical");
}

function listLegacySkillNames(legacyDir: string): string[] {
  return listSkillNames(legacyDir, "legacy");
}

function listFilesRecursive(rootDir: string, baseDir = rootDir): string[] {
  const entries = readdirSync(baseDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = join(baseDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(rootDir, absolute));
    } else if (entry.isFile()) {
      files.push(relative(rootDir, absolute));
    }
  }
  return files.sort();
}

export type LegacyShimDrift = {
  skill: string;
  relativePath: string;
  reason: "missing_legacy" | "missing_canonical" | "content_mismatch" | "extra_legacy";
};

export function findLegacyShimDrift(paths: LegacyShimPaths): LegacyShimDrift[] {
  const drifts: LegacyShimDrift[] = [];
  const skillNames = listCanonicalSkillNames(paths.canonicalDir);
  const canonicalSkillSet = new Set(skillNames);

  for (const skillName of skillNames) {
    const canonicalSkillRoot = join(paths.canonicalDir, skillName);
    const legacySkillRoot = join(paths.legacyDir, skillName);
    const canonicalFiles = listFilesRecursive(canonicalSkillRoot);

    if (!existsSync(legacySkillRoot)) {
      if (canonicalFiles.length > 0) {
        drifts.push({
          skill: skillName,
          relativePath: "(entire skill tree)",
          reason: "missing_legacy",
        });
      }
      continue;
    }

    for (const rel of canonicalFiles) {
      const canonicalPath = join(canonicalSkillRoot, rel);
      const legacyPath = join(legacySkillRoot, rel);
      if (!existsSync(legacyPath)) {
        drifts.push({
          skill: skillName,
          relativePath: rel,
          reason: "missing_legacy",
        });
        continue;
      }
      const canonical = readFileSync(canonicalPath);
      const legacy = readFileSync(legacyPath);
      if (!canonical.equals(legacy)) {
        drifts.push({
          skill: skillName,
          relativePath: rel,
          reason: "content_mismatch",
        });
      }
    }

    const legacyFiles = listFilesRecursive(legacySkillRoot);
    for (const rel of legacyFiles) {
      const canonicalPath = join(canonicalSkillRoot, rel);
      if (!existsSync(canonicalPath)) {
        drifts.push({
          skill: skillName,
          relativePath: rel,
          reason: "extra_legacy",
        });
      }
    }
  }

  for (const legacySkillName of listLegacySkillNames(paths.legacyDir)) {
    if (!canonicalSkillSet.has(legacySkillName)) {
      drifts.push({
        skill: legacySkillName,
        relativePath: "(entire skill tree)",
        reason: "extra_legacy",
      });
    }
  }

  return drifts;
}

export type SyncLegacyShimResult = {
  skillNames: string[];
  filesCopied: number;
};

export function syncLegacySkillShim(paths: LegacyShimPaths): SyncLegacyShimResult {
  const skillNames = listCanonicalSkillNames(paths.canonicalDir);
  mkdirSync(paths.legacyDir, { recursive: true });

  let filesCopied = 0;
  for (const skillName of skillNames) {
    const canonicalSkillRoot = join(paths.canonicalDir, skillName);
    const legacySkillRoot = join(paths.legacyDir, skillName);
    rmSync(legacySkillRoot, { recursive: true, force: true });
    cpSync(canonicalSkillRoot, legacySkillRoot, { recursive: true });
    const copied = listFilesRecursive(canonicalSkillRoot);
    filesCopied += copied.length;
  }

  // Remove legacy skill dirs (and stray files) that no longer exist canonically.
  if (existsSync(paths.legacyDir)) {
    for (const entry of readdirSync(paths.legacyDir, { withFileTypes: true })) {
      const entryPath = join(paths.legacyDir, entry.name);
      if (entry.isDirectory()) {
        if (!skillNames.includes(entry.name)) {
          rmSync(entryPath, { recursive: true, force: true });
        }
      } else {
        rmSync(entryPath, { force: true });
      }
    }
  }

  return { skillNames, filesCopied };
}

export function assertLegacyShimInSync(paths: LegacyShimPaths): void {
  const drifts = findLegacyShimDrift(paths);
  if (drifts.length === 0) {
    return;
  }
  const summary = drifts
    .slice(0, 20)
    .map(
      (d) =>
        `- ${d.skill}/${d.relativePath}: ${d.reason}`,
    )
    .join("\n");
  const extra =
    drifts.length > 20 ? `\n… and ${drifts.length - 20} more` : "";
  throw new Error(
    `Legacy skill shim out of sync with ${CANONICAL_SKILLS_DIR}/. ` +
      `Run: npm run sync:legacy-skill-shim\n${summary}${extra}`,
  );
}
