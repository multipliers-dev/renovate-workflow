import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export const POLICY_FILENAME = "renovate-policy.yml";

export type PolicyCheck = {
  name: string;
  workflow?: string;
  command?: string;
  required: boolean;
};

export type RenovatePolicy = {
  policy_version: number;
  repo: {
    owner?: string;
    name?: string;
    workspace_roots: string[];
    sensitive_paths: string[];
  };
  packages: {
    high_touch: string[];
    low_risk_tooling: string[];
    runtime_rule?: string;
  };
  checks: {
    required: PolicyCheck[];
  };
  merge: {
    authority: "maintainer_agent" | "human";
    batch_allowed_for: string[];
  };
  deployment?: {
    mode: "pat_branch" | "github_app";
  };
};

export type PackageClassification =
  | "high_touch"
  | "low_risk_tooling"
  | "runtime"
  | "unlisted_package";

export function loadPolicyFile(path: string): RenovatePolicy {
  const raw = readFileSync(path, "utf8");
  const parsed = parseYaml(raw) as RenovatePolicy;
  validatePolicy(parsed);
  return parsed;
}

export function validatePolicy(policy: RenovatePolicy): void {
  if (typeof policy.policy_version !== "number") {
    throw new Error("policy_version must be a number");
  }
  if (!policy.repo?.workspace_roots?.length) {
    throw new Error("repo.workspace_roots must be a non-empty list");
  }
  if (!Array.isArray(policy.repo.sensitive_paths)) {
    throw new Error("repo.sensitive_paths must be a list");
  }
  if (!Array.isArray(policy.packages.high_touch)) {
    throw new Error("packages.high_touch must be a list");
  }
  if (!Array.isArray(policy.packages.low_risk_tooling)) {
    throw new Error("packages.low_risk_tooling must be a list");
  }
  if (!Array.isArray(policy.checks?.required)) {
    throw new Error("checks.required must be a list");
  }
  for (const check of policy.checks.required) {
    if (!check.name) {
      throw new Error("each check requires a name");
    }
    if (!check.workflow && !check.command) {
      throw new Error(`check ${check.name} requires workflow or command`);
    }
  }
}

export function classifyPackage(
  packageName: string,
  policy: RenovatePolicy,
  options?: { isRuntimeDependency?: boolean },
): PackageClassification {
  const normalized = packageName.trim().toLowerCase();
  const inList = (list: string[]) =>
    list.some((entry) => entry.trim().toLowerCase() === normalized);

  if (inList(policy.packages.high_touch)) {
    return "high_touch";
  }
  if (inList(policy.packages.low_risk_tooling)) {
    return "low_risk_tooling";
  }
  if (policy.packages.runtime_rule && options?.isRuntimeDependency) {
    return "runtime";
  }
  return "unlisted_package";
}

export function riskClassForClassification(
  classification: PackageClassification,
): "auto_merge_candidate" | "review_manually" | "investigate" | "stop" {
  switch (classification) {
    case "low_risk_tooling":
      return "auto_merge_candidate";
    case "high_touch":
      return "review_manually";
    case "runtime":
      return "review_manually";
    case "unlisted_package":
      return "investigate";
  }
}

export function mergeAllowedForClassification(
  classification: PackageClassification,
  policy: RenovatePolicy,
): boolean {
  if (policy.merge.authority === "human") {
    return false;
  }
  return policy.merge.batch_allowed_for.includes(classification);
}
