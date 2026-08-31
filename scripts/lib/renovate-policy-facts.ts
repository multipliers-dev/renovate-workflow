import { readFileSync } from "node:fs";

import yaml from "yaml";

import { loadRenovatePolicy, type RenovatePolicy } from "./renovate-guardrails.js";

export type PackageCategory = "high_touch" | "low_risk_tooling" | "runtime" | "unlisted";

export type SensitivePathRule = {
  patterns: string[];
  risk_class: string;
};

export type ConsumerRepoFacts = {
  workspace_roots?: string[];
  sensitive_paths?: string[];
  sensitive_path_rules?: SensitivePathRule[];
  analytics_paths?: string[];
  auth_paths?: string[];
  renovate_branch_prefix?: string;
};

export type ConsumerPackageFacts = {
  high_touch?: string[];
  low_risk_tooling?: string[];
};

export type LockfileThresholdFacts = {
  line_delta_limit_default: number;
  line_delta_limit_lockfile_maintenance: number;
  pr_file_count_single_package_max: number;
};

export type PrCiCheckFacts = {
  workflow?: string;
  job?: string;
};

export type ConsumerPolicyFacts = RenovatePolicy & {
  packages?: ConsumerPackageFacts;
  repo?: ConsumerRepoFacts;
};

export type ClassifyPackageInput = {
  name: string;
  isDevDependency: boolean;
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function packageMatchesPattern(name: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim();
  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return name.startsWith(prefix);
  }
  if (normalizedPattern.includes("*")) {
    const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(name);
  }
  return name === normalizedPattern;
}

export function packageMatchesAnyPattern(name: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => packageMatchesPattern(name, pattern));
}

export function loadConsumerPolicyFacts(path: string): ConsumerPolicyFacts {
  loadRenovatePolicy(path);
  const raw = readFileSync(path, "utf8");
  return yaml.parse(raw) as ConsumerPolicyFacts;
}

export function classifyPackage(
  input: ClassifyPackageInput,
  policy: ConsumerPolicyFacts
): PackageCategory {
  const { name, isDevDependency } = input;
  const packages = policy.packages ?? {};

  if (packageMatchesAnyPattern(name, packages.high_touch)) {
    return "high_touch";
  }

  if (packageMatchesAnyPattern(name, packages.low_risk_tooling)) {
    return "low_risk_tooling";
  }

  if (!isDevDependency) {
    return "runtime";
  }

  return "unlisted";
}

export function riskClassForPackageCategory(category: PackageCategory): string {
  switch (category) {
    case "high_touch":
      return "high_touch_tooling";
    case "low_risk_tooling":
      return "low_risk_tooling_patch";
    case "runtime":
      return "runtime_dependency";
    case "unlisted":
      return "unlisted_package";
  }
}

function pathMatchesPattern(file: string, pattern: string): boolean {
  const normalizedFile = normalizePath(file);
  const normalizedPattern = normalizePath(pattern.trim());

  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }

  if (normalizedPattern.includes("*")) {
    const escaped = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*");
    return new RegExp(`^${escaped}$`).test(normalizedFile);
  }

  return normalizedFile === normalizedPattern;
}

export function resolveSensitivePathRiskClass(
  file: string,
  policy: ConsumerPolicyFacts
): string | null {
  const repo = policy.repo;
  if (!repo) {
    return null;
  }

  for (const rule of repo.sensitive_path_rules ?? []) {
    if (rule.patterns.some((pattern) => pathMatchesPattern(file, pattern))) {
      return rule.risk_class;
    }
  }

  if (repo.analytics_paths?.some((pattern) => pathMatchesPattern(file, pattern))) {
    return "analytics_or_telemetry";
  }

  if (repo.auth_paths?.some((pattern) => pathMatchesPattern(file, pattern))) {
    return "auth_or_security";
  }

  if (repo.sensitive_paths?.some((pattern) => pathMatchesPattern(file, pattern))) {
    return "sensitive_path_change";
  }

  return null;
}

export function getLockfileThresholds(policy: ConsumerPolicyFacts): LockfileThresholdFacts {
  const thresholds = (
    policy.checks?.lockfile_within_threshold as { thresholds?: Partial<LockfileThresholdFacts> }
  )?.thresholds;

  return {
    line_delta_limit_default: thresholds?.line_delta_limit_default ?? 800,
    line_delta_limit_lockfile_maintenance: thresholds?.line_delta_limit_lockfile_maintenance ?? 2000,
    pr_file_count_single_package_max: thresholds?.pr_file_count_single_package_max ?? 30,
  };
}

export function getPrCiCheck(policy: ConsumerPolicyFacts): PrCiCheckFacts {
  const check = policy.checks?.pr_ci_green as { workflow?: string; job?: string } | undefined;
  return {
    workflow: check?.workflow,
    job: check?.job,
  };
}

export function lineDeltaLimit(lockfileMaintenance: boolean, policy: ConsumerPolicyFacts): number {
  const thresholds = getLockfileThresholds(policy);
  return lockfileMaintenance
    ? thresholds.line_delta_limit_lockfile_maintenance
    : thresholds.line_delta_limit_default;
}
