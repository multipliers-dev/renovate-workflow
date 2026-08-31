import type { ClassifierPacket } from "./derive-stop-causes.js";

const REQUIRED_FIELDS: Array<keyof ClassifierPacket> = [
  "schema_version",
  "policy_version",
  "pr_number",
  "head_sha",
  "base_sha",
  "package_name",
  "classification",
  "risk_class",
  "merge_authority",
  "captured_at",
  "checks",
];

export function validateClassifierPacket(
  value: unknown,
): asserts value is ClassifierPacket {
  if (!value || typeof value !== "object") {
    throw new Error("packet must be an object");
  }
  const packet = value as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in packet)) {
      throw new Error(`packet missing required field: ${field}`);
    }
  }
  if (!Array.isArray(packet.checks)) {
    throw new Error("packet.checks must be an array");
  }
}

export function packetSummary(packet: ClassifierPacket): string {
  return `PR #${packet.pr_number} ${packet.package_name} (${packet.classification}/${packet.risk_class}) @ ${packet.head_sha.slice(0, 7)}`;
}
