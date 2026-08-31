import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import yaml from "yaml";

import {
  assertCheckAssembly,
  assertConditionalChecksExist,
  assertMergeAuthorityRulesAreAuthorityOnly,
  assertRiskClassesMatch,
  enumerateActiveStopReasons,
  evaluateEffectiveExecutionAuthority,
  evaluateMergeAuthority,
  evaluatePreflight,
  evaluateTriggeredStops,
  loadRenovatePolicy,
  parsePacketSchemaRiskClasses,
  resolveOverridableClassifierStops,
  type RenovatePacket,
} from "./lib/renovate-guardrails.js";
import { deriveStopCauses } from "./lib/derive-stop-causes.js";

const REPO_ROOT = resolve(process.cwd());
const POLICY_PATH = join(REPO_ROOT, "examples/example-repo/renovate-policy.yml");
const SCHEMA_PATH = join(REPO_ROOT, ".cursor/skills/renovate-classifier/packet-schema.md");
const FIXTURES_DIR = join(REPO_ROOT, "scripts/fixtures/renovate-packets");

function loadFixturePacket(name: string): RenovatePacket {
  const raw = readFileSync(join(FIXTURES_DIR, name), "utf8");
  return yaml.parse(raw) as RenovatePacket;
}

describe("renovate policy contract", () => {
  const policy = loadRenovatePolicy(POLICY_PATH);
  const schemaMarkdown = readFileSync(SCHEMA_PATH, "utf8");
  const schemaRiskClasses = parsePacketSchemaRiskClasses(schemaMarkdown);

  it("policy version is a non-empty string", () => {
    expect(typeof policy.version).toBe("string");
    expect(policy.version.trim().length).toBeGreaterThan(0);
  });

  it("policy risk_classes match packet-schema enum", () => {
    expect(() => assertRiskClassesMatch(policy, schemaRiskClasses)).not.toThrow();
  });

  it("check_assembly requires pr_ci_green and post_merge_main_ci_green", () => {
    expect(() => assertCheckAssembly(policy)).not.toThrow();
  });

  it("merge_authority_rules are authority-only (no static requires)", () => {
    expect(() => assertMergeAuthorityRulesAreAuthorityOnly(policy)).not.toThrow();
  });

  it("every check_assembly.conditional key has a checks entry", () => {
    expect(() => assertConditionalChecksExist(policy)).not.toThrow();
  });
});

describe("renovate packet fixtures — required_checks smoke", () => {
  const fixtureNames = [
    "human-required-stop.yaml",
    "stale-head-sha-stop.yaml",
    "policy-version-drift-stop.yaml",
    "denied-merge-authority-stop.yaml",
    "unknown-risk-class-stop.yaml",
    "low-risk-tooling-major-not-stopped.yaml",
    "high-touch-patch-investigate.yaml",
  ];

  it.each(fixtureNames)("%s includes always-required checks", (fixtureName) => {
    const packet = loadFixturePacket(fixtureName);
    expect(packet.required_checks).toContain("pr_ci_green");
    expect(packet.required_checks).toContain("post_merge_main_ci_green");
  });
});

describe("renovate guardrail evaluators", () => {
  const policy = loadRenovatePolicy(POLICY_PATH);

  it("human-required-stop triggers evaluateTriggeredStops", () => {
    const packet = loadFixturePacket("human-required-stop.yaml");
    const result = evaluateTriggeredStops(packet);
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.gate).toBe("triggered");
    }
  });

  it("stale-head-sha-stop triggers evaluatePreflight on head_sha mismatch", () => {
    const packet = loadFixturePacket("stale-head-sha-stop.yaml");
    const result = evaluatePreflight(packet, {
      livePolicyVersion: packet.policy_version!,
      liveHeadSha: "live_head_sha_differs_from_packet",
    });
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.gate).toBe("head_sha");
    }
  });

  it("policy-version-drift-stop triggers evaluatePreflight on policy_version mismatch", () => {
    const packet = loadFixturePacket("policy-version-drift-stop.yaml");
    const result = evaluatePreflight(packet, {
      livePolicyVersion: policy.version,
      liveHeadSha: packet.pr!.head_sha!,
    });
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.gate).toBe("policy_version");
    }
  });

  it("denied-merge-authority-stop triggers evaluateMergeAuthority", () => {
    const packet = loadFixturePacket("denied-merge-authority-stop.yaml");
    const result = evaluateMergeAuthority(packet, policy);
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.gate).toBe("merge_authority");
    }
  });

  it("unknown-risk-class-stop triggers evaluateMergeAuthority", () => {
    const packet = loadFixturePacket("unknown-risk-class-stop.yaml");
    const result = evaluateMergeAuthority(packet, policy);
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.gate).toBe("unknown_risk_class");
    }
  });

  it("low-risk-tooling-major-not-stopped passes authority gate only", () => {
    const packet = loadFixturePacket("low-risk-tooling-major-not-stopped.yaml");
    const result = evaluateMergeAuthority(packet, policy);
    expect(result).toEqual({ stop: false });
  });

  it("low-risk-tooling-major with workflow file fails allowed_paths gate", () => {
    const packet = loadFixturePacket("low-risk-tooling-major-not-stopped.yaml");
    const withWorkflow: RenovatePacket = {
      ...packet,
      evidence: {
        ...packet.evidence,
        changed_files: [...(packet.evidence?.changed_files ?? []), ".github/workflows/ci.yml"],
      },
    };
    const result = evaluateMergeAuthority(withWorkflow, policy);
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.gate).toBe("allowed_paths");
    }
  });
});

describe("stop_causes guardrails", () => {
  const policy = loadRenovatePolicy(POLICY_PATH);

  it("high-touch-patch-investigate stop_causes match deriveStopCauses", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    expect(packet.stop_causes).toEqual(deriveStopCauses(packet));
  });

  it("enumerateActiveStopReasons fails closed when stop_causes missing", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const { stop_causes: _ignored, ...withoutCauses } = packet;
    const result = enumerateActiveStopReasons(withoutCauses as RenovatePacket);
    expect(result.failClosed).toBe(true);
  });

  it("enumerateActiveStopReasons fails closed when stop_causes empty", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const result = enumerateActiveStopReasons({ ...packet, stop_causes: [] });
    expect(result.failClosed).toBe(true);
  });

  it("sole high-touch stop_causes are overridable under investigation_approved", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const overridable = resolveOverridableClassifierStops(
      policy,
      packet.classification!.risk_class!
    );
    const result = evaluateTriggeredStops(packet, {
      executionMode: "investigation_approved",
      overridableStopReasons: overridable,
    });
    expect(result).toEqual({ stop: false });
  });

  it("high-touch plus lockfile_threshold_exceeded still stops", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const blocked: RenovatePacket = {
      ...packet,
      triggered_human_required: ["runtime_behavior_affected", "lockfile_threshold_exceeded"],
    };
    blocked.stop_causes = deriveStopCauses(blocked);
    const overridable = resolveOverridableClassifierStops(
      policy,
      blocked.classification!.risk_class!
    );
    const result = evaluateTriggeredStops(blocked, {
      executionMode: "investigation_approved",
      overridableStopReasons: overridable,
    });
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.reason).toContain("triggered_lockfile_threshold_exceeded");
    }
  });

  it("decision_defer is never overridden", () => {
    const packet: RenovatePacket = {
      stop: true,
      stop_causes: ["decision_defer"],
      classification: {
        decision: "defer",
        merge_authority: "denied",
        risk_class: "high_touch_tooling",
      },
    };
    const overridable = resolveOverridableClassifierStops(policy, "high_touch_tooling");
    const result = evaluateTriggeredStops(packet, {
      executionMode: "investigation_approved",
      overridableStopReasons: overridable,
    });
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.reason).toContain("decision_defer");
    }
  });
});

describe("evaluateEffectiveExecutionAuthority", () => {
  const policy = loadRenovatePolicy(POLICY_PATH);

  it("auto-path unchanged without overlay", () => {
    const packet = loadFixturePacket("low-risk-tooling-major-not-stopped.yaml");
    const result = evaluateEffectiveExecutionAuthority(packet, policy);
    expect(result).toEqual({
      effectiveExecutionAuthority: "unchanged",
      mergeAuthority: "allowed_if_no_code_changes",
    });
  });

  it("investigation_approved overlay with --approved derives merge authority", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: {
          verdict: "ready_for_human_merge",
          report_path: ".agent-runs/renovate/2026-07-15-pr-402-investigation.md",
          investigated_at: "2026-07-15T00:00:00.000Z",
          investigation_head_sha: packet.pr!.head_sha!,
        },
      },
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "investigation_approved_merge",
      originalMergeAuthority: "denied",
      suppressedStopCauses: [
        "decision_human_required",
        "stop_flag_expected_human_required",
        "triggered_runtime_behavior_affected_sole",
      ],
    });
  });

  it("unlisted pair-only packet derives investigation_approved_merge with --approved", () => {
    const packet = loadFixturePacket("unlisted-package-investigate.yaml");
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: {
          verdict: "ready_for_human_merge",
          report_path: ".agent-runs/renovate/2026-07-20-pr-425-investigation.md",
          investigated_at: "2026-07-20T00:00:00.000Z",
          investigation_head_sha: packet.pr!.head_sha!,
        },
      },
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "investigation_approved_merge",
      originalMergeAuthority: "denied",
      suppressedStopCauses: ["decision_human_required", "stop_flag_expected_human_required"],
    });
  });

  it("unlisted sole-runtime shape derives investigation_approved_merge with --approved", () => {
    const base = loadFixturePacket("unlisted-package-investigate.yaml");
    const packet: RenovatePacket = {
      ...base,
      triggered_human_required: ["runtime_behavior_affected"],
      stop_reason: "runtime_behavior_affected",
    };
    packet.stop_causes = deriveStopCauses(packet);

    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: {
          verdict: "ready_for_human_merge",
          report_path: ".agent-runs/renovate/2026-07-20-pr-425-investigation.md",
          investigated_at: "2026-07-20T00:00:00.000Z",
          investigation_head_sha: packet.pr!.head_sha!,
        },
      },
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "investigation_approved_merge",
      originalMergeAuthority: "denied",
      suppressedStopCauses: [
        "decision_human_required",
        "stop_flag_expected_human_required",
        "triggered_runtime_behavior_affected_sole",
      ],
    });
  });

  it("unlisted packet with non-overridable stop stays denied even with --approved", () => {
    const base = loadFixturePacket("unlisted-package-investigate.yaml");
    const packet: RenovatePacket = {
      ...base,
      triggered_human_required: ["lockfile_threshold_exceeded"],
    };
    packet.stop_causes = deriveStopCauses(packet);

    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: {
          verdict: "ready_for_human_merge",
          report_path: ".agent-runs/renovate/2026-07-20-pr-425-investigation.md",
          investigated_at: "2026-07-20T00:00:00.000Z",
          investigation_head_sha: packet.pr!.head_sha!,
        },
      },
    });
    expect(result.effectiveExecutionAuthority).toBe("denied");
    if (result.effectiveExecutionAuthority === "denied") {
      expect(result.reason).toContain("triggered_lockfile_threshold_exceeded");
    }
  });

  it("investigation overlay without --approved stays denied", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      overlay: {
        execution_mode: "investigation_approved",
        investigation: { verdict: "ready_for_human_merge" },
      },
    });
    expect(result.effectiveExecutionAuthority).toBe("denied");
  });

  it("minimal verdict-only overlay stays denied without report metadata", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: { verdict: "ready_for_human_merge" },
      },
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority: "denied",
      reason: "missing investigation.report_path",
    });
  });

  it("overlay with stale investigation_head_sha stays denied", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: {
          verdict: "ready_for_human_merge",
          report_path: ".agent-runs/renovate/2026-07-15-pr-402-investigation.md",
          investigated_at: "2026-07-15T00:00:00.000Z",
          investigation_head_sha: "stale_head_sha",
        },
      },
    });
    expect(result.effectiveExecutionAuthority).toBe("denied");
    if (result.effectiveExecutionAuthority === "denied") {
      expect(result.reason).toContain("investigation_head_sha");
    }
  });

  it("overlay stays denied when changed_files exceed investigation allowed_paths", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const withWorkflow: RenovatePacket = {
      ...packet,
      evidence: {
        ...packet.evidence,
        changed_files: [...(packet.evidence?.changed_files ?? []), ".github/workflows/ci.yml"],
      },
    };
    const result = evaluateEffectiveExecutionAuthority(withWorkflow, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: {
          verdict: "ready_for_human_merge",
          report_path: ".agent-runs/renovate/2026-07-15-pr-402-investigation.md",
          investigated_at: "2026-07-15T00:00:00.000Z",
          investigation_head_sha: withWorkflow.pr!.head_sha!,
        },
      },
    });
    expect(result.effectiveExecutionAuthority).toBe("denied");
    if (result.effectiveExecutionAuthority === "denied") {
      expect(result.reason).toContain("allowed_paths");
    }
  });

  it("incomplete stop_causes stay denied even with valid overlay and --approved", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const incomplete: RenovatePacket = {
      ...packet,
      stop_causes: ["decision_human_required"],
    };
    const result = evaluateEffectiveExecutionAuthority(incomplete, policy, {
      humanApprovalModifier: "--approved",
      overlay: {
        execution_mode: "investigation_approved",
        investigation: {
          verdict: "ready_for_human_merge",
          report_path: ".agent-runs/renovate/2026-07-15-pr-402-investigation.md",
          investigated_at: "2026-07-15T00:00:00.000Z",
          investigation_head_sha: incomplete.pr!.head_sha!,
        },
      },
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority: "denied",
      reason: "packet stop_causes do not match deriveStopCauses derivation",
    });
  });

  it("duplicate padded stop_causes stay denied with valid overlay and --approved", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const padded: RenovatePacket = {
      ...packet,
      stop_causes: [
        "decision_human_required",
        "decision_human_required",
        "decision_human_required",
      ],
    };
    const result = evaluateEffectiveExecutionAuthority(padded, policy, {
      humanApprovalModifier: "--approved",
      overlay: validInvestigationOverlay(padded),
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority: "denied",
      reason: "packet stop_causes do not match deriveStopCauses derivation",
    });
  });

  function validInvestigationOverlay(packet: RenovatePacket) {
    return {
      execution_mode: "investigation_approved" as const,
      investigation: {
        verdict: "ready_for_human_merge",
        report_path: ".agent-runs/renovate/2026-07-15-pr-402-investigation.md",
        investigated_at: "2026-07-15T00:00:00.000Z",
        investigation_head_sha: packet.pr!.head_sha!,
      },
    };
  }

  it("agent_review_required high_touch packet stays denied with valid overlay", () => {
    const packet: RenovatePacket = {
      ...loadFixturePacket("high-touch-patch-investigate.yaml"),
      classification: {
        decision: "agent_review_required",
        merge_authority: "allowed_if_no_code_changes",
        risk_class: "high_touch_tooling",
      },
      stop: true,
      stop_causes: ["triggered_runtime_behavior_affected_sole"],
    };
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: validInvestigationOverlay(packet),
    });
    expect(result.effectiveExecutionAuthority).toBe("denied");
    if (result.effectiveExecutionAuthority === "denied") {
      expect(result.reason).toContain("human_required");
    }
  });

  it("human_required with non-denied merge_authority stays denied", () => {
    const packet: RenovatePacket = {
      ...loadFixturePacket("high-touch-patch-investigate.yaml"),
      classification: {
        decision: "human_required",
        merge_authority: "allowed",
        risk_class: "high_touch_tooling",
      },
    };
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: validInvestigationOverlay(packet),
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority: "allowed",
      reason: "merge_authority allowed is not denied",
    });
  });

  it("stop false high_touch packet stays denied with valid overlay", () => {
    const packet: RenovatePacket = {
      ...loadFixturePacket("high-touch-patch-investigate.yaml"),
      stop: false,
      stop_reason: null,
      stop_causes: [],
    };
    const result = evaluateEffectiveExecutionAuthority(packet, policy, {
      humanApprovalModifier: "--approved",
      overlay: validInvestigationOverlay(packet),
    });
    expect(result).toEqual({
      effectiveExecutionAuthority: "denied",
      originalMergeAuthority: "denied",
      reason: "packet stop flag is not true",
    });
  });
});
