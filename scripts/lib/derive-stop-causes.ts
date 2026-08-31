export type ClassifierPacket = {
  schema_version: number;
  policy_version: number;
  pr_number: number;
  head_sha: string;
  base_sha: string;
  package_name: string;
  classification: string;
  risk_class: string;
  merge_authority: "maintainer_agent" | "human";
  captured_at: string;
  checks: Array<{ name: string; status: "success" | "failure" | "pending" | "missing" }>;
  notes?: string;
};

export type StopCause =
  | "policy_version_drift"
  | "stale_head_sha"
  | "merge_authority_denied"
  | "unknown_risk_class"
  | "unlisted_package"
  | "required_check_missing"
  | "required_check_failed";

export type StopCauseRecord = {
  cause: StopCause;
  message: string;
};

export function deriveStopCauses(input: {
  packet: ClassifierPacket;
  policyVersion: number;
  currentHeadSha: string;
  requiredChecks: string[];
}): StopCauseRecord[] {
  const causes: StopCauseRecord[] = [];

  if (input.packet.policy_version !== input.policyVersion) {
    causes.push({
      cause: "policy_version_drift",
      message: `packet policy_version ${input.packet.policy_version} != active ${input.policyVersion}`,
    });
  }

  if (input.packet.head_sha !== input.currentHeadSha) {
    causes.push({
      cause: "stale_head_sha",
      message: `packet head_sha ${input.packet.head_sha} != current ${input.currentHeadSha}`,
    });
  }

  if (input.packet.merge_authority !== "maintainer_agent") {
    causes.push({
      cause: "merge_authority_denied",
      message: `merge authority is ${input.packet.merge_authority}`,
    });
  }

  const knownRiskClasses = new Set([
    "auto_merge_candidate",
    "review_manually",
    "investigate",
    "stop",
  ]);
  if (!knownRiskClasses.has(input.packet.risk_class)) {
    causes.push({
      cause: "unknown_risk_class",
      message: `unknown risk_class ${input.packet.risk_class}`,
    });
  }

  if (input.packet.classification === "unlisted_package") {
    causes.push({
      cause: "unlisted_package",
      message: `package ${input.packet.package_name} is unlisted in policy`,
    });
  }

  for (const required of input.requiredChecks) {
    const check = input.packet.checks.find((entry) => entry.name === required);
    if (!check) {
      causes.push({
        cause: "required_check_missing",
        message: `required check missing: ${required}`,
      });
      continue;
    }
    if (check.status === "failure") {
      causes.push({
        cause: "required_check_failed",
        message: `required check failed: ${required}`,
      });
    }
    if (check.status === "pending" || check.status === "missing") {
      causes.push({
        cause: "required_check_missing",
        message: `required check not green: ${required} (${check.status})`,
      });
    }
  }

  return causes;
}

export function shouldStop(causes: StopCauseRecord[]): boolean {
  return causes.length > 0;
}
