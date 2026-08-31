import { readFileSync } from "node:fs";

import yaml from "yaml";

import {
  isKnownStopCause,
  validateStopCausesDerivation,
  type StopCauseKey,
} from "./derive-stop-causes.js";

export type MergeAuthorityRuleKey = "allowed" | "allowed_if_no_code_changes" | "denied";

export type GuardrailStopGate =
  | "policy_version"
  | "head_sha"
  | "triggered"
  | "merge_authority"
  | "allowed_paths"
  | "unknown_risk_class";

export type GuardrailResult =
  { stop: false } | { stop: true; gate: GuardrailStopGate; reason: string };

export type InvestigationApprovedExecutionMode = {
  eligible_risk_classes: string[];
  overridable_classifier_stops: Record<string, StopCauseKey[]>;
  requires_investigation_verdict: string;
  requires_human_approval_modifier: string;
  allowed_paths?: string[];
  execute_time_gates?: string[];
};

export type RenovatePolicy = {
  version: string;
  risk_classes: Record<string, string[]>;
  merge_authority_rules: Record<
    MergeAuthorityRuleKey,
    { risk_classes: string[]; allowed_paths?: string[] }
  >;
  execution_modes?: {
    investigation_approved?: InvestigationApprovedExecutionMode;
  };
  check_assembly: {
    requires_always: string[];
    conditional: Record<string, unknown>;
  };
  checks: Record<string, unknown>;
};

export type RenovatePacket = {
  policy_version?: string;
  pr?: { head_sha?: string };
  classification?: {
    decision?: string;
    merge_authority?: MergeAuthorityRuleKey;
    risk_class?: string;
  };
  evidence?: { changed_files?: string[] };
  required_checks?: string[];
  triggered_human_required?: string[];
  stop?: boolean;
  stop_reason?: string | null;
  stop_causes?: string[];
};

export type ExecutionOverlay = {
  execution_mode?: string;
  investigation?: {
    report_path?: string;
    verdict?: string;
    investigated_at?: string;
    investigation_head_sha?: string;
  };
};

export type ActiveStopReasonsResult =
  | { failClosed: false; causes: StopCauseKey[] }
  | { failClosed: true; causes: StopCauseKey[]; reason: string };

export type TriggeredStopsOptions = {
  executionMode?: "investigation_approved";
  overridableStopReasons?: StopCauseKey[];
};

export type EffectiveExecutionAuthorityResult =
  | {
      effectiveExecutionAuthority: "unchanged";
      mergeAuthority: MergeAuthorityRuleKey;
    }
  | {
      effectiveExecutionAuthority: "investigation_approved_merge";
      originalMergeAuthority: MergeAuthorityRuleKey;
      suppressedStopCauses: StopCauseKey[];
    }
  | {
      effectiveExecutionAuthority: "denied";
      originalMergeAuthority: MergeAuthorityRuleKey;
      reason: string;
    };

export type EffectiveAuthorityContext = {
  overlay?: ExecutionOverlay;
  humanApprovalModifier?: string;
};

export type PreflightContext = {
  livePolicyVersion: string;
  liveHeadSha: string;
};

const REQUIRED_ALWAYS_CHECKS = ["pr_ci_green", "post_merge_main_ci_green"] as const;

export function loadRenovatePolicy(path: string): RenovatePolicy {
  const raw = readFileSync(path, "utf8");
  const policy = yaml.parse(raw) as RenovatePolicy;

  if (typeof policy.version !== "string" || policy.version.trim() === "") {
    throw new Error(`Renovate policy at ${path} must have a non-empty version string`);
  }

  return policy;
}

export function parsePacketSchemaRiskClasses(schemaMarkdown: string): Set<string> {
  const match = schemaMarkdown.match(/^\s*risk_class:\s*(.+)$/m);
  if (!match?.[1]) {
    throw new Error("packet-schema.md must contain a risk_class pipe enum in the example block");
  }

  return new Set(
    match[1]
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function collectPolicyRiskClasses(policy: RenovatePolicy): Set<string> {
  const classes = new Set<string>();

  for (const bucket of Object.values(policy.risk_classes ?? {})) {
    for (const riskClass of bucket) {
      classes.add(riskClass);
    }
  }

  for (const rule of Object.values(policy.merge_authority_rules ?? {})) {
    for (const riskClass of rule.risk_classes ?? []) {
      classes.add(riskClass);
    }
  }

  return classes;
}

export function assertRiskClassesMatch(policy: RenovatePolicy, schemaClasses: Set<string>): void {
  const policyClasses = collectPolicyRiskClasses(policy);

  const missingInPolicy = [...schemaClasses].filter((value) => !policyClasses.has(value));
  const missingInSchema = [...policyClasses].filter((value) => !schemaClasses.has(value));

  if (missingInPolicy.length > 0 || missingInSchema.length > 0) {
    const parts: string[] = [];
    if (missingInPolicy.length > 0) {
      parts.push(`in schema but not policy: ${missingInPolicy.join(", ")}`);
    }
    if (missingInSchema.length > 0) {
      parts.push(`in policy but not schema: ${missingInSchema.join(", ")}`);
    }
    throw new Error(`risk_class enum mismatch (${parts.join("; ")})`);
  }
}

export function assertCheckAssembly(policy: RenovatePolicy): void {
  const requiresAlways = policy.check_assembly?.requires_always ?? [];
  for (const check of REQUIRED_ALWAYS_CHECKS) {
    if (!requiresAlways.includes(check)) {
      throw new Error(`check_assembly.requires_always must include ${check}`);
    }
  }
}

function findMergeAuthorityRuleForRiskClass(
  policy: RenovatePolicy,
  riskClass: string
): {
  ruleKey: MergeAuthorityRuleKey;
  rule: RenovatePolicy["merge_authority_rules"][MergeAuthorityRuleKey];
} | null {
  for (const ruleKey of ["allowed", "allowed_if_no_code_changes", "denied"] as const) {
    const rule = policy.merge_authority_rules?.[ruleKey];
    if (rule?.risk_classes?.includes(riskClass)) {
      return { ruleKey, rule };
    }
  }
  return null;
}

function isAllowedManifestOrLockfilePath(file: string): boolean {
  return fileMatchesAllowedPaths(file, ["**/package.json", "package-lock.json"]);
}

export function fileMatchesAllowedPaths(file: string, allowedPaths: string[]): boolean {
  const normalized = file.replace(/\\/g, "/");

  for (const pattern of allowedPaths) {
    if (pattern === "package-lock.json" && normalized === "package-lock.json") {
      return true;
    }

    if (pattern === "**/package.json") {
      const segments = normalized.split("/");
      if (segments[segments.length - 1] === "package.json") {
        return true;
      }
    }
  }

  return false;
}

export function validateInvestigationOverlay(
  packet: RenovatePacket,
  overlay: ExecutionOverlay,
  mode: InvestigationApprovedExecutionMode
): string | null {
  const investigation = overlay.investigation;
  if (!investigation?.report_path?.trim()) {
    return "missing investigation.report_path";
  }

  if (!investigation.investigated_at?.trim()) {
    return "missing investigation.investigated_at";
  }

  const investigationHeadSha = investigation.investigation_head_sha?.trim();
  if (!investigationHeadSha) {
    return "missing investigation.investigation_head_sha";
  }

  const packetHeadSha = packet.pr?.head_sha?.trim();
  if (!packetHeadSha) {
    return "missing packet pr.head_sha for investigation head binding";
  }

  if (investigationHeadSha !== packetHeadSha) {
    return "investigation_head_sha does not match packet pr.head_sha";
  }

  const allowedPaths = mode.allowed_paths ?? [];
  if (allowedPaths.length > 0) {
    const changedFiles = packet.evidence?.changed_files ?? [];
    const disallowed = changedFiles.filter((file) => !fileMatchesAllowedPaths(file, allowedPaths));
    if (disallowed.length > 0) {
      return `changed_files outside investigation allowed_paths: ${disallowed.join(", ")}`;
    }
  }

  return null;
}

export function validateInvestigationLanePreconditions(packet: RenovatePacket): string | null {
  if (packet.classification?.decision !== "human_required") {
    return `decision ${packet.classification?.decision ?? "missing"} is not human_required`;
  }

  if (packet.classification?.merge_authority !== "denied") {
    return `merge_authority ${packet.classification?.merge_authority ?? "missing"} is not denied`;
  }

  if (packet.stop !== true) {
    return "packet stop flag is not true";
  }

  return null;
}

export function evaluatePreflight(packet: RenovatePacket, ctx: PreflightContext): GuardrailResult {
  const packetVersion = packet.policy_version?.trim();
  if (!packetVersion || packetVersion !== ctx.livePolicyVersion) {
    return {
      stop: true,
      gate: "policy_version",
      reason: `policy_version mismatch (packet: ${packetVersion ?? "missing"}, live: ${ctx.livePolicyVersion})`,
    };
  }

  const packetHeadSha = packet.pr?.head_sha?.trim();
  if (!packetHeadSha || packetHeadSha !== ctx.liveHeadSha) {
    return {
      stop: true,
      gate: "head_sha",
      reason: `head_sha mismatch (packet: ${packetHeadSha ?? "missing"}, live: ${ctx.liveHeadSha})`,
    };
  }

  return { stop: false };
}

export function resolveOverridableClassifierStops(
  policy: RenovatePolicy,
  riskClass: string
): StopCauseKey[] {
  const mode = policy.execution_modes?.investigation_approved;
  if (!mode) {
    return [];
  }

  return mode.overridable_classifier_stops[riskClass] ?? [];
}

export function enumerateActiveStopReasons(packet: RenovatePacket): ActiveStopReasonsResult {
  if (packet.stop !== true) {
    return { failClosed: false, causes: [] };
  }

  const rawCauses = packet.stop_causes;
  if (!rawCauses || rawCauses.length === 0) {
    return {
      failClosed: true,
      causes: [],
      reason: "stop: true with missing or empty stop_causes",
    };
  }

  const causes: StopCauseKey[] = [];
  for (const cause of rawCauses) {
    if (!isKnownStopCause(cause)) {
      return {
        failClosed: true,
        causes,
        reason: `unknown stop_cause key: ${cause}`,
      };
    }
    causes.push(cause);
  }

  return { failClosed: false, causes };
}

function partitionTriggeredStops(
  activeCauses: StopCauseKey[],
  overridableStopReasons: StopCauseKey[]
): { remaining: StopCauseKey[]; suppressed: StopCauseKey[] } {
  const overridableSet = new Set(overridableStopReasons);
  const remaining: StopCauseKey[] = [];
  const suppressed: StopCauseKey[] = [];

  for (const cause of activeCauses) {
    if (cause === "decision_defer" || !overridableSet.has(cause)) {
      remaining.push(cause);
    } else {
      suppressed.push(cause);
    }
  }

  return { remaining, suppressed };
}

export function evaluateTriggeredStops(
  packet: RenovatePacket,
  options?: TriggeredStopsOptions
): GuardrailResult {
  const activeStopReasons = enumerateActiveStopReasons(packet);
  const decision = packet.classification?.decision;
  const triggered = packet.triggered_human_required ?? [];

  if (options?.executionMode === "investigation_approved") {
    if (activeStopReasons.failClosed) {
      return {
        stop: true,
        gate: "triggered",
        reason: activeStopReasons.reason,
      };
    }

    if (packet.stop !== true && decision !== "human_required" && decision !== "defer") {
      if (triggered.length > 0) {
        return {
          stop: true,
          gate: "triggered",
          reason: `triggered_human_required without stop_causes: ${triggered.join(", ")}`,
        };
      }
      return { stop: false };
    }

    if (packet.stop !== true) {
      if (decision === "defer") {
        return { stop: true, gate: "triggered", reason: "decision is defer" };
      }
      if (decision === "human_required") {
        return {
          stop: true,
          gate: "triggered",
          reason: "human_required without stop: true and structured stop_causes",
        };
      }
      if (triggered.length > 0) {
        return {
          stop: true,
          gate: "triggered",
          reason: `triggered_human_required without stop_causes: ${triggered.join(", ")}`,
        };
      }
      return { stop: false };
    }

    const overridable = options.overridableStopReasons ?? [];
    const { remaining, suppressed } = partitionTriggeredStops(
      activeStopReasons.causes,
      overridable
    );

    if (remaining.length > 0) {
      return {
        stop: true,
        gate: "triggered",
        reason: `non-overridable stop_causes: ${remaining.join(", ")}`,
      };
    }

    if (suppressed.length > 0) {
      return { stop: false };
    }

    return {
      stop: true,
      gate: "triggered",
      reason: "packet stop flag is true with no overridable stop_causes",
    };
  }

  if (packet.stop === true) {
    return { stop: true, gate: "triggered", reason: "packet stop flag is true" };
  }

  if (decision === "human_required" || decision === "defer") {
    return { stop: true, gate: "triggered", reason: `decision is ${decision}` };
  }

  if (triggered.length > 0) {
    return {
      stop: true,
      gate: "triggered",
      reason: `triggered_human_required: ${triggered.join(", ")}`,
    };
  }

  return { stop: false };
}

export function evaluateEffectiveExecutionAuthority(
  packet: RenovatePacket,
  policy: RenovatePolicy,
  context: EffectiveAuthorityContext = {}
): EffectiveExecutionAuthorityResult {
  const originalMergeAuthority = packet.classification?.merge_authority ?? "denied";
  const overlay = context.overlay;
  const modifier = context.humanApprovalModifier;

  if (!overlay || overlay.execution_mode !== "investigation_approved") {
    return {
      effectiveExecutionAuthority: "unchanged",
      mergeAuthority: originalMergeAuthority,
    };
  }

  const mode = policy.execution_modes?.investigation_approved;
  if (!mode) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: "policy missing execution_modes.investigation_approved",
    };
  }

  if (modifier !== mode.requires_human_approval_modifier) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: `human approval modifier ${modifier ?? "missing"} does not match policy requirement`,
    };
  }

  const riskClass = packet.classification?.risk_class;
  if (!riskClass || !mode.eligible_risk_classes.includes(riskClass)) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: `risk_class ${riskClass ?? "missing"} is not eligible for investigation_approved`,
    };
  }

  const laneError = validateInvestigationLanePreconditions(packet);
  if (laneError) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: laneError,
    };
  }

  if (overlay.investigation?.verdict !== mode.requires_investigation_verdict) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: `investigation verdict ${overlay.investigation?.verdict ?? "missing"} does not match policy requirement`,
    };
  }

  const overlayValidationError = validateInvestigationOverlay(packet, overlay, mode);
  if (overlayValidationError) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: overlayValidationError,
    };
  }

  const activeStopReasons = enumerateActiveStopReasons(packet);
  if (activeStopReasons.failClosed) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: activeStopReasons.reason,
    };
  }

  const derivationError = validateStopCausesDerivation(packet);
  if (derivationError) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: derivationError,
    };
  }

  const overridable = resolveOverridableClassifierStops(policy, riskClass);
  const triggeredResult = evaluateTriggeredStops(packet, {
    executionMode: "investigation_approved",
    overridableStopReasons: overridable,
  });

  if (triggeredResult.stop) {
    return {
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority,
      reason: triggeredResult.reason,
    };
  }

  const { suppressed } = partitionTriggeredStops(activeStopReasons.causes, overridable);

  return {
    effectiveExecutionAuthority: "investigation_approved_merge",
    originalMergeAuthority,
    suppressedStopCauses: suppressed,
  };
}

export function evaluateMergeAuthority(
  packet: RenovatePacket,
  policy: RenovatePolicy
): GuardrailResult {
  const riskClass = packet.classification?.risk_class;
  const mergeAuthority = packet.classification?.merge_authority;
  const changedFiles = packet.evidence?.changed_files ?? [];

  if (!riskClass) {
    return { stop: true, gate: "unknown_risk_class", reason: "missing risk_class" };
  }

  const ruleEntry = findMergeAuthorityRuleForRiskClass(policy, riskClass);
  if (!ruleEntry) {
    return {
      stop: true,
      gate: "unknown_risk_class",
      reason: `unlisted risk_class: ${riskClass}`,
    };
  }

  const { ruleKey } = ruleEntry;

  if (mergeAuthority !== ruleKey) {
    return {
      stop: true,
      gate: "merge_authority",
      reason: `merge_authority ${mergeAuthority ?? "missing"} does not match policy rule ${ruleKey} for ${riskClass}`,
    };
  }

  if (ruleKey === "denied") {
    return {
      stop: true,
      gate: "merge_authority",
      reason: `risk_class ${riskClass} is denied`,
    };
  }

  if (ruleKey === "allowed_if_no_code_changes") {
    const disallowed = changedFiles.filter((file) => !isAllowedManifestOrLockfilePath(file));
    if (disallowed.length > 0) {
      return {
        stop: true,
        gate: "allowed_paths",
        reason: `changed_files outside allowed paths: ${disallowed.join(", ")}`,
      };
    }
  }

  return { stop: false };
}

export function assertMergeAuthorityRulesAreAuthorityOnly(policy: RenovatePolicy): void {
  for (const [ruleKey, rule] of Object.entries(policy.merge_authority_rules ?? {})) {
    if ("requires" in rule) {
      throw new Error(
        `merge_authority_rules.${ruleKey} must not include static requires (authority-only)`
      );
    }
  }
}

export function assertConditionalChecksExist(policy: RenovatePolicy): void {
  const conditional = policy.check_assembly?.conditional ?? {};
  const checks = policy.checks ?? {};

  for (const checkKey of Object.keys(conditional)) {
    if (!(checkKey in checks)) {
      throw new Error(
        `check_assembly.conditional.${checkKey} has no matching checks.${checkKey} entry`
      );
    }
  }
}
