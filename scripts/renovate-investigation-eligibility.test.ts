import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import yaml from "yaml";

import { evaluateInvestigationEligibility } from "./lib/renovate-investigation-eligibility.js";
import { deriveStopCauses } from "./lib/derive-stop-causes.js";
import { loadRenovatePolicy, type RenovatePacket } from "./lib/renovate-guardrails.js";

const REPO_ROOT = resolve(process.cwd());
const POLICY_PATH = join(REPO_ROOT, "examples/example-repo/renovate-policy.yml");
const FIXTURES_DIR = join(REPO_ROOT, "scripts/fixtures/renovate-packets");

const UNLISTED_OVERRIDABLE_CAUSES = [
  "decision_human_required",
  "stop_flag_expected_human_required",
  "triggered_runtime_behavior_affected_sole",
] as const;

function loadFixturePacket(name: string): RenovatePacket {
  const raw = readFileSync(join(FIXTURES_DIR, name), "utf8");
  return yaml.parse(raw) as RenovatePacket;
}

describe("evaluateInvestigationEligibility", () => {
  const policy = loadRenovatePolicy(POLICY_PATH);

  it("high-touch-patch-investigate fixture is investigation-eligible", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const result = evaluateInvestigationEligibility(packet, policy);
    expect(result).toEqual({
      eligible: true,
      riskClass: "high_touch_tooling",
      overridableCauses: [
        "decision_human_required",
        "stop_flag_expected_human_required",
        "triggered_runtime_behavior_affected_sole",
      ],
    });
  });

  it.each([
    {
      name: "unlisted human-required pair only",
      build: () => loadFixturePacket("unlisted-package-investigate.yaml"),
    },
    {
      name: "unlisted sole-runtime shape",
      build: () => {
        const packet = loadFixturePacket("unlisted-package-investigate.yaml");
        const withRuntime: RenovatePacket = {
          ...packet,
          triggered_human_required: ["runtime_behavior_affected"],
          stop_reason: "runtime_behavior_affected",
        };
        withRuntime.stop_causes = deriveStopCauses(withRuntime);
        return withRuntime;
      },
    },
  ])("$name is investigation-eligible", ({ build }) => {
    const packet = build();
    expect(packet.stop_causes).toEqual(deriveStopCauses(packet));
    const result = evaluateInvestigationEligibility(packet, policy);
    expect(result).toEqual({
      eligible: true,
      riskClass: "unlisted_package",
      overridableCauses: [...UNLISTED_OVERRIDABLE_CAUSES],
    });
  });

  it("rejects unlisted packet with lockfile_threshold_exceeded in stop_causes", () => {
    const packet = loadFixturePacket("unlisted-package-investigate.yaml");
    const blocked: RenovatePacket = {
      ...packet,
      triggered_human_required: ["lockfile_threshold_exceeded"],
    };
    blocked.stop_causes = deriveStopCauses(blocked);

    const result = evaluateInvestigationEligibility(blocked, policy);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain("triggered_lockfile_threshold_exceeded");
    }
  });

  it("rejects high-touch packet with lockfile_threshold_exceeded in stop_causes", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const blocked: RenovatePacket = {
      ...packet,
      triggered_human_required: ["runtime_behavior_affected", "lockfile_threshold_exceeded"],
    };
    blocked.stop_causes = deriveStopCauses(blocked);

    const result = evaluateInvestigationEligibility(blocked, policy);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain("triggered_lockfile_threshold_exceeded");
    }
  });

  it("rejects packet with missing stop_causes when stop is true", () => {
    const packet = loadFixturePacket("high-touch-patch-investigate.yaml");
    const { stop_causes: _ignored, ...withoutCauses } = packet;

    const result = evaluateInvestigationEligibility(withoutCauses as RenovatePacket, policy);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toContain("stop_causes");
    }
  });

  it("rejects low-risk auto-merge packets", () => {
    const packet = loadFixturePacket("low-risk-tooling-major-not-stopped.yaml");
    const result = evaluateInvestigationEligibility(packet, policy);
    expect(result.eligible).toBe(false);
  });
});
