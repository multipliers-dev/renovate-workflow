import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveStopCauses,
  shouldStop,
  type ClassifierPacket,
} from "../lib/derive-stop-causes.js";
import { evaluateGuardrails } from "../lib/renovate-guardrails.js";
import {
  classifyPackage,
  loadPolicyFile,
  riskClassForClassification,
} from "../lib/renovate-policy.js";
import { parseGitHubRemote, resolveRepoIdentity } from "../lib/renovate-repo.js";
import { validateClassifierPacket } from "../lib/renovate-packet.js";

const fixturesDir = join(import.meta.dirname, "..", "fixtures");

describe("renovate-repo", () => {
  it("parses HTTPS and SSH remotes", () => {
    expect(parseGitHubRemote("https://github.com/multipliers-dev/renovate-workflow.git")).toEqual({
      owner: "multipliers-dev",
      name: "renovate-workflow",
      fullName: "multipliers-dev/renovate-workflow",
    });
    expect(parseGitHubRemote("git@github.com:multipliers-dev/renovate-workflow.git")).toEqual({
      owner: "multipliers-dev",
      name: "renovate-workflow",
      fullName: "multipliers-dev/renovate-workflow",
    });
  });

  it("resolves explicit owner/name without git", () => {
    expect(resolveRepoIdentity({ owner: "acme", name: "demo" })).toEqual({
      owner: "acme",
      name: "demo",
      fullName: "acme/demo",
    });
  });
});

describe("renovate-policy", () => {
  const policyPath = join(fixturesDir, "example-policy.yml");
  const policy = loadPolicyFile(policyPath);

  it("classifies allowlisted packages", () => {
    expect(classifyPackage("typescript", policy)).toBe("low_risk_tooling");
    expect(classifyPackage("vite", policy)).toBe("high_touch");
    expect(riskClassForClassification("low_risk_tooling")).toBe("auto_merge_candidate");
    expect(riskClassForClassification("high_touch")).toBe("review_manually");
  });

  it("derives unlisted from absence", () => {
    expect(classifyPackage("left-pad", policy)).toBe("unlisted_package");
    expect(classifyPackage("express", policy, { isRuntimeDependency: true })).toBe(
      "runtime",
    );
    expect(riskClassForClassification("unlisted_package")).toBe("investigate");
  });
});

describe("derive-stop-causes", () => {
  it("passes a valid packet", () => {
    const packet = JSON.parse(
      readFileSync(join(fixturesDir, "packet-valid.json"), "utf8"),
    ) as ClassifierPacket;
    const causes = deriveStopCauses({
      packet,
      policyVersion: 1,
      currentHeadSha: packet.head_sha,
      requiredChecks: ["ci", "typecheck"],
    });
    expect(shouldStop(causes)).toBe(false);
  });

  it("detects stale head and policy drift", () => {
    const packet = JSON.parse(
      readFileSync(join(fixturesDir, "packet-stale.json"), "utf8"),
    ) as ClassifierPacket;
    const causes = deriveStopCauses({
      packet,
      policyVersion: 1,
      currentHeadSha: "current-head-sha",
      requiredChecks: ["ci", "typecheck"],
    });
    expect(causes.map((entry) => entry.cause)).toEqual(
      expect.arrayContaining([
        "policy_version_drift",
        "stale_head_sha",
        "merge_authority_denied",
        "unlisted_package",
        "required_check_missing",
      ]),
    );
  });
});

describe("renovate-guardrails", () => {
  it("evaluates fixture packet against policy", () => {
    const packet = JSON.parse(
      readFileSync(join(fixturesDir, "packet-valid.json"), "utf8"),
    ) as ClassifierPacket;
    validateClassifierPacket(packet);
    const result = evaluateGuardrails({
      policyPath: join(fixturesDir, "example-policy.yml"),
      packet,
      currentHeadSha: packet.head_sha,
    });
    expect(result.allowedToMerge).toBe(true);
  });
});
