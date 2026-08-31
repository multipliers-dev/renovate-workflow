#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { evaluateGuardrails } from "./lib/renovate-guardrails.js";
import { validateClassifierPacket } from "./lib/renovate-packet.js";

function usage(): never {
  console.error(
    "usage: renovate-freshness-poll --policy <path> --runs <dir> [--head-sha <sha>]",
  );
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || !value) {
      usage();
    }
    args[key.slice(2)] = value;
    i += 1;
  }
  if (!args.policy || !args.runs) {
    usage();
  }
  return {
    policyPath: args.policy,
    runsDir: args.runs,
    headSha: args["head-sha"],
  };
}

function findLatestPacket(runsDir: string): { path: string; packet: unknown } | null {
  let latest: { path: string; mtimeMs: number; packet: unknown } | null = null;
  for (const entry of readdirSync(runsDir)) {
    const fullPath = join(runsDir, entry);
    if (!statSync(fullPath).isFile() || !entry.endsWith(".json")) {
      continue;
    }
    const packet = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    const mtimeMs = statSync(fullPath).mtimeMs;
    if (!latest || mtimeMs > latest.mtimeMs) {
      latest = { path: fullPath, mtimeMs, packet };
    }
  }
  return latest ? { path: latest.path, packet: latest.packet } : null;
}

function main() {
  const { policyPath, runsDir, headSha } = parseArgs(process.argv);
  const latest = findLatestPacket(runsDir);
  if (!latest) {
    console.log("freshness: no packets found");
    return;
  }

  validateClassifierPacket(latest.packet);
  const effectiveHeadSha = headSha ?? latest.packet.head_sha;
  const result = evaluateGuardrails({
    policyPath,
    packet: latest.packet,
    currentHeadSha: effectiveHeadSha,
  });

  console.log(`freshness: packet ${latest.path}`);
  console.log(
    result.allowedToMerge ? "freshness: current" : "freshness: stale_or_blocked",
  );
  if (!result.allowedToMerge) {
    for (const cause of result.stopCauses) {
      console.log(`stop: ${cause.cause} — ${cause.message}`);
    }
  }
}

main();
