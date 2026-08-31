import { describe, expect, it } from "vitest";

import {
  deriveStopCauses,
  stopCausesMatchDerivation,
  type StopCauseKey,
} from "./lib/derive-stop-causes.js";
import { evaluateInvestigationEligibility } from "./lib/renovate-investigation-eligibility.js";
import { loadRenovatePolicy, type RenovatePacket } from "./lib/renovate-guardrails.js";

const POLICY_PATH = "examples/example-repo/renovate-policy.yml";

function highTouchPacket(
  triggered: string[],
  overrides: Partial<RenovatePacket> = {}
): RenovatePacket {
  const base: RenovatePacket = {
    policy_version: "3",
    stop: true,
    classification: {
      decision: "human_required",
      merge_authority: "denied",
      risk_class: "high_touch_tooling",
    },
    triggered_human_required: triggered,
    pr: { head_sha: "abc123" },
    evidence: {
      changed_files: ["package-lock.json", "server/package.json"],
    },
    ...overrides,
  };

  return {
    ...base,
    stop_causes: deriveStopCauses(base),
  };
}

describe("deriveStopCauses", () => {
  it("derives decision_human_required when decision is human_required", () => {
    const causes = deriveStopCauses({
      classification: { decision: "human_required" },
    });
    expect(causes).toContain("decision_human_required");
  });

  it("derives stop_flag_expected_human_required when stop and human_required", () => {
    const causes = deriveStopCauses({
      stop: true,
      classification: { decision: "human_required" },
    });
    expect(causes).toContain("stop_flag_expected_human_required");
  });

  it("derives triggered_runtime_behavior_affected_sole for sole runtime trigger", () => {
    const causes = deriveStopCauses({
      triggered_human_required: ["runtime_behavior_affected"],
    });
    expect(causes).toEqual(["triggered_runtime_behavior_affected_sole"]);
  });

  it("derives triggered_runtime_behavior_affected when runtime is combined with other triggers", () => {
    const causes = deriveStopCauses({
      triggered_human_required: ["runtime_behavior_affected", "lockfile_threshold_exceeded"],
    });
    expect(causes).toContain("triggered_runtime_behavior_affected");
    expect(causes).not.toContain("triggered_runtime_behavior_affected_sole");
    expect(causes).toContain("triggered_lockfile_threshold_exceeded");
  });

  it("derives triggered_implementation_changes_required", () => {
    const causes = deriveStopCauses({
      triggered_human_required: ["implementation_changes_required"],
    });
    expect(causes).toEqual(["triggered_implementation_changes_required"]);
  });

  it("derives triggered_ci_failure_unexplained", () => {
    const causes = deriveStopCauses({
      triggered_human_required: ["ci_failure_unexplained"],
    });
    expect(causes).toEqual(["triggered_ci_failure_unexplained"]);
  });

  it("derives triggered_lockfile_threshold_exceeded when lockfile trigger present", () => {
    const causes = deriveStopCauses({
      triggered_human_required: ["lockfile_threshold_exceeded"],
    });
    expect(causes).toContain("triggered_lockfile_threshold_exceeded");
  });

  it("derives triggered_human_required_unmapped for unknown trigger keys", () => {
    const causes = deriveStopCauses({
      triggered_human_required: ["unexpected_trigger"],
    });
    expect(causes).toEqual(["triggered_human_required_unmapped"]);
  });

  it("derives decision_defer when decision is defer", () => {
    const causes = deriveStopCauses({
      stop: true,
      classification: { decision: "defer" },
    });
    expect(causes).toEqual(["decision_defer"]);
  });

  it("matches vitest #402 high-touch patch shape", () => {
    const causes = deriveStopCauses({
      stop: true,
      classification: { decision: "human_required" },
      triggered_human_required: ["runtime_behavior_affected"],
    });
    expect(causes).toEqual([
      "decision_human_required",
      "stop_flag_expected_human_required",
      "triggered_runtime_behavior_affected_sole",
    ]);
  });
});

describe("stopCausesMatchDerivation multiset contract", () => {
  const basePacket = {
    stop: true,
    classification: { decision: "human_required" },
    triggered_human_required: ["runtime_behavior_affected"],
  };
  const canonical = deriveStopCauses(basePacket);

  function withCauses(stop_causes: string[]) {
    return { ...basePacket, stop_causes };
  }

  function permuteCauses(causes: StopCauseKey[]): StopCauseKey[][] {
    if (causes.length <= 1) {
      return [causes];
    }

    const permutations: StopCauseKey[][] = [];
    for (let index = 0; index < causes.length; index += 1) {
      const current = causes[index]!;
      const rest = [...causes.slice(0, index), ...causes.slice(index + 1)];
      for (const tail of permuteCauses(rest)) {
        permutations.push([current, ...tail]);
      }
    }
    return permutations;
  }

  it("accepts every permutation of the canonical array", () => {
    for (const stop_causes of permuteCauses(canonical)) {
      expect(stopCausesMatchDerivation(withCauses(stop_causes))).toBe(true);
    }
  });

  it.each(canonical.map((cause, index) => [cause, index] as const))(
    "rejects deletion of %s",
    (_cause, index) => {
      const mutated = canonical.filter((_, causeIndex) => causeIndex !== index);
      expect(stopCausesMatchDerivation(withCauses(mutated))).toBe(false);
    }
  );

  it("rejects addition of an extra cause", () => {
    expect(stopCausesMatchDerivation(withCauses([...canonical, "decision_defer"]))).toBe(false);
  });

  it.each(canonical)(
    "rejects replacing %s with a cause outside the canonical multiset",
    (cause) => {
      const mutated = [...canonical];
      const index = mutated.indexOf(cause);
      mutated[index] = "decision_defer";
      expect(stopCausesMatchDerivation(withCauses(mutated))).toBe(false);
    }
  );

  it.each(canonical)("rejects duplicating %s within canonical length", (cause) => {
    const replaceIndex = canonical.findIndex((entry) => entry !== cause);
    const mutated = [...canonical];
    mutated[replaceIndex] = cause;
    expect(stopCausesMatchDerivation(withCauses(mutated))).toBe(false);
  });
});

describe("deriveStopCauses investigation ineligibility", () => {
  const policy = loadRenovatePolicy(POLICY_PATH);

  it.each([
    [
      "runtime_behavior_affected + implementation_changes_required",
      ["runtime_behavior_affected", "implementation_changes_required"],
    ],
    [
      "runtime_behavior_affected + ci_failure_unexplained",
      ["runtime_behavior_affected", "ci_failure_unexplained"],
    ],
    ["implementation_changes_required alone", ["implementation_changes_required"]],
    ["ci_failure_unexplained alone", ["ci_failure_unexplained"]],
  ])("%s remains investigation-ineligible", (_label, triggered) => {
    const packet = highTouchPacket(triggered);
    const result = evaluateInvestigationEligibility(packet, policy);
    expect(result.eligible).toBe(false);
  });
});
