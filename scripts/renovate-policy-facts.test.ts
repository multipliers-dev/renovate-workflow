import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyPackage,
  getLockfileThresholds,
  getPrCiCheck,
  lineDeltaLimit,
  loadConsumerPolicyFacts,
  packageMatchesPattern,
  resolveSensitivePathRiskClass,
  riskClassForPackageCategory,
} from "./lib/renovate-policy-facts.js";

const POLICY_PATH = join(resolve(process.cwd()), "examples/example-repo/renovate-policy.yml");

describe("renovate-policy-facts — consumer YAML drives classification", () => {
  const policy = loadConsumerPolicyFacts(POLICY_PATH);

  it("loads package lists from consumer policy, not hardcoded rubric", () => {
    expect(policy.packages?.high_touch).toContain("react");
    expect(policy.packages?.low_risk_tooling).toContain("prettier");
    expect(policy.packages?.high_touch).not.toContain("prettier");
  });

  it("classifies high_touch packages from policy.packages.high_touch", () => {
    expect(classifyPackage({ name: "react", isDevDependency: true }, policy)).toBe("high_touch");
    expect(riskClassForPackageCategory("high_touch")).toBe("high_touch_tooling");
  });

  it("classifies low_risk_tooling from policy.packages.low_risk_tooling including globs", () => {
    expect(packageMatchesPattern("@types/node", "@types/*")).toBe(true);
    expect(classifyPackage({ name: "prettier", isDevDependency: true }, policy)).toBe(
      "low_risk_tooling"
    );
    expect(classifyPackage({ name: "@types/node", isDevDependency: true }, policy)).toBe(
      "low_risk_tooling"
    );
  });

  it("derives unlisted when package matches no policy list and is a devDependency", () => {
    expect(classifyPackage({ name: "tsx", isDevDependency: true }, policy)).toBe("unlisted");
    expect(riskClassForPackageCategory("unlisted")).toBe("unlisted_package");
  });

  it("classifies runtime dependencies not in allowlists", () => {
    expect(classifyPackage({ name: "cors", isDevDependency: false }, policy)).toBe("runtime");
    expect(riskClassForPackageCategory("runtime")).toBe("runtime_dependency");
  });

  it("resolves sensitive paths from repo.sensitive_paths and path rules", () => {
    expect(resolveSensitivePathRiskClass("src/server/lib/prompt/system.ts", policy)).toBe(
      "sensitive_path_change"
    );
    expect(resolveSensitivePathRiskClass("src/frontend/lib/analytics.ts", policy)).toBe(
      "analytics_or_telemetry"
    );
    expect(resolveSensitivePathRiskClass("package.json", policy)).toBeNull();
  });

  it("reads lockfile thresholds from checks.lockfile_within_threshold", () => {
    expect(getLockfileThresholds(policy)).toEqual({
      line_delta_limit_default: 800,
      line_delta_limit_lockfile_maintenance: 2000,
      pr_file_count_single_package_max: 30,
    });
    expect(lineDeltaLimit(false, policy)).toBe(800);
    expect(lineDeltaLimit(true, policy)).toBe(2000);
  });

  it("reads merge-blocking CI from checks.pr_ci_green", () => {
    expect(getPrCiCheck(policy)).toEqual({
      workflow: ".github/workflows/ci.yml",
      job: "test",
    });
  });
});

describe("renovate-policy-facts — policy edits change classification", () => {
  it("reclassifies when consumer high_touch list differs", () => {
    const policy = loadConsumerPolicyFacts(POLICY_PATH);
    const customized: typeof policy = {
      ...policy,
      packages: {
        ...policy.packages,
        high_touch: ["left-pad"],
        low_risk_tooling: policy.packages?.low_risk_tooling,
      },
    };

    expect(classifyPackage({ name: "react", isDevDependency: true }, policy)).toBe("high_touch");
    expect(classifyPackage({ name: "react", isDevDependency: true }, customized)).toBe("unlisted");
    expect(classifyPackage({ name: "left-pad", isDevDependency: true }, customized)).toBe(
      "high_touch"
    );
  });
});
