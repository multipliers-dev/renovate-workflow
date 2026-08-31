/**
 * Single derivation table for classifier emission and guardrails evaluation.
 * Keys must match the reference table in the renovate investigation lane plan.
 */

export const TRIGGER_WATCH_KEYS = [
  "implementation_changes_required",
  "lockfile_threshold_exceeded",
  "ci_failure_unexplained",
  "runtime_behavior_affected",
] as const;

export type TriggerWatchKey = (typeof TRIGGER_WATCH_KEYS)[number];

export const KNOWN_STOP_CAUSES = [
  "decision_human_required",
  "stop_flag_expected_human_required",
  "triggered_implementation_changes_required",
  "triggered_lockfile_threshold_exceeded",
  "triggered_ci_failure_unexplained",
  "triggered_runtime_behavior_affected",
  "triggered_runtime_behavior_affected_sole",
  "triggered_human_required_unmapped",
  "decision_defer",
] as const;

export type StopCauseKey = (typeof KNOWN_STOP_CAUSES)[number];

const KNOWN_STOP_CAUSE_SET = new Set<string>(KNOWN_STOP_CAUSES);
const TRIGGER_WATCH_KEY_SET = new Set<string>(TRIGGER_WATCH_KEYS);

export type DeriveStopCausesInput = {
  stop?: boolean;
  classification?: {
    decision?: string;
  };
  triggered_human_required?: string[];
  stop_causes?: string[];
};

export function isKnownStopCause(value: string): value is StopCauseKey {
  return KNOWN_STOP_CAUSE_SET.has(value);
}

function deriveTriggerStopCauses(triggered: string[]): StopCauseKey[] {
  const causes: StopCauseKey[] = [];

  if (triggered.some((key) => !TRIGGER_WATCH_KEY_SET.has(key))) {
    causes.push("triggered_human_required_unmapped");
  }

  if (triggered.includes("implementation_changes_required")) {
    causes.push("triggered_implementation_changes_required");
  }

  if (triggered.includes("lockfile_threshold_exceeded")) {
    causes.push("triggered_lockfile_threshold_exceeded");
  }

  if (triggered.includes("ci_failure_unexplained")) {
    causes.push("triggered_ci_failure_unexplained");
  }

  if (triggered.includes("runtime_behavior_affected")) {
    if (triggered.length === 1) {
      causes.push("triggered_runtime_behavior_affected_sole");
    } else {
      causes.push("triggered_runtime_behavior_affected");
    }
  }

  return causes;
}

export function deriveStopCauses(packet: DeriveStopCausesInput): StopCauseKey[] {
  const causes: StopCauseKey[] = [];
  const decision = packet.classification?.decision;
  const triggered = packet.triggered_human_required ?? [];

  if (decision === "defer") {
    causes.push("decision_defer");
  }

  if (decision === "human_required") {
    causes.push("decision_human_required");
  }

  if (packet.stop === true && decision === "human_required") {
    causes.push("stop_flag_expected_human_required");
  }

  causes.push(...deriveTriggerStopCauses(triggered));

  return causes;
}

export function stopCausesMatchDerivation(packet: DeriveStopCausesInput): boolean {
  const expectedCauses = deriveStopCauses(packet);
  const packetCauses = packet.stop_causes ?? [];

  if (packetCauses.length !== expectedCauses.length) {
    return false;
  }

  const sortedPacketCauses = [...packetCauses].sort();
  const sortedExpectedCauses = [...expectedCauses].sort();

  return sortedPacketCauses.every((cause, index) => cause === sortedExpectedCauses[index]);
}

export function validateStopCausesDerivation(packet: DeriveStopCausesInput): string | null {
  if (packet.stop !== true) {
    return null;
  }

  if (!stopCausesMatchDerivation(packet)) {
    return "packet stop_causes do not match deriveStopCauses derivation";
  }

  return null;
}
