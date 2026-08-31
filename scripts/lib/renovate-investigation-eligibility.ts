import { validateStopCausesDerivation, type StopCauseKey } from "./derive-stop-causes.js";
import {
  enumerateActiveStopReasons,
  resolveOverridableClassifierStops,
  validateInvestigationLanePreconditions,
  type RenovatePacket,
  type RenovatePolicy,
} from "./renovate-guardrails.js";

export type InvestigationEligibilityResult =
  | { eligible: true; riskClass: string; overridableCauses: StopCauseKey[] }
  | { eligible: false; reason: string };

export function evaluateInvestigationEligibility(
  packet: RenovatePacket,
  policy: RenovatePolicy
): InvestigationEligibilityResult {
  const mode = policy.execution_modes?.investigation_approved;
  if (!mode) {
    return { eligible: false, reason: "policy missing execution_modes.investigation_approved" };
  }

  const riskClass = packet.classification?.risk_class;
  if (!riskClass) {
    return { eligible: false, reason: "missing classification.risk_class" };
  }

  if (!mode.eligible_risk_classes.includes(riskClass)) {
    return { eligible: false, reason: `risk_class ${riskClass} is not investigation-eligible` };
  }

  const laneError = validateInvestigationLanePreconditions(packet);
  if (laneError) {
    return { eligible: false, reason: laneError };
  }

  const activeCauses = enumerateActiveStopReasons(packet);
  if (activeCauses.failClosed) {
    return {
      eligible: false,
      reason: activeCauses.reason ?? "stop_causes missing, empty, or unknown",
    };
  }

  const overridableCauses = resolveOverridableClassifierStops(policy, riskClass);
  const nonOverridable = activeCauses.causes.filter((cause) => !overridableCauses.includes(cause));

  if (nonOverridable.length > 0) {
    return {
      eligible: false,
      reason: `non-overridable stop_causes remain: ${nonOverridable.join(", ")}`,
    };
  }

  if (activeCauses.causes.length === 0) {
    return { eligible: false, reason: "no structured stop_causes to route for investigation" };
  }

  const derivationError = validateStopCausesDerivation(packet);
  if (derivationError) {
    return { eligible: false, reason: derivationError };
  }

  return { eligible: true, riskClass, overridableCauses };
}
