import {
  deriveStopCauses,
  type ClassifierPacket,
  type StopCauseRecord,
} from "./derive-stop-causes.js";
import {
  loadPolicyFile,
  type RenovatePolicy,
  validatePolicy,
} from "./renovate-policy.js";

export type GuardrailInput = {
  policyPath: string;
  packet: ClassifierPacket;
  currentHeadSha: string;
};

export type GuardrailResult = {
  policy: RenovatePolicy;
  stopCauses: StopCauseRecord[];
  allowedToMerge: boolean;
};

export function evaluateGuardrails(input: GuardrailInput): GuardrailResult {
  const policy = loadPolicyFile(input.policyPath);
  validatePolicy(policy);

  const requiredChecks = policy.checks.required
    .filter((check) => check.required !== false)
    .map((check) => check.name);

  const stopCauses = deriveStopCauses({
    packet: input.packet,
    policyVersion: policy.policy_version,
    currentHeadSha: input.currentHeadSha,
    requiredChecks,
  });

  const blockedByRisk = input.packet.risk_class === "stop";
  const allowedToMerge = !blockedByRisk && stopCauses.length === 0;

  return { policy, stopCauses, allowedToMerge };
}

export function formatGuardrailReport(result: GuardrailResult): string {
  if (result.allowedToMerge) {
    return "guardrails: pass";
  }
  const lines = result.stopCauses.map(
    (cause) => `- ${cause.cause}: ${cause.message}`,
  );
  return ["guardrails: stop", ...lines].join("\n");
}
