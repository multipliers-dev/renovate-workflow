#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  normalizeGhCheckRunsForExpectedHead,
  normalizeGhCommitStatusesForExpectedHead,
  runRenovateBabysit,
  type CiObservation,
  type GhCheckRunsResponse,
  type GhCommitStatusResponse,
  type MergeObservation,
  type RenovateBabysitConfig,
} from "./lib/renovate-freshness-poll.js";

const execFileAsync = promisify(execFile);

type CliOptions = {
  repo: string;
  pr: string;
  expectedHeadSha: string;
  config: RenovateBabysitConfig;
};

type GhPrViewResponse = {
  headRefOid?: string;
  baseRefOid?: string;
  mergeStateStatus?: string;
};

function printUsage(): void {
  console.error(`Usage: npm exec -- tsx scripts/renovate-freshness-poll.ts --repo <owner/repo> --pr <number> --expected-head <sha>

Runs the Renovate post-update babysit helper and prints one JSON result.

Required:
  --repo <owner/repo>
  --pr <number>
  --expected-head <sha>

Debug-only overrides (do not use from renovate-classifier skill prose):
  --debug-poll-interval-ms <ms>
  --debug-ci-budget-ms <ms>
  --debug-unknown-max <count>
`);
}

function readFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseRenovateFreshnessPollArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> & { config: RenovateBabysitConfig } = { config: {} };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--repo":
        options.repo = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--pr":
        options.pr = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--expected-head":
        options.expectedHeadSha = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--debug-poll-interval-ms":
        options.config.pollIntervalMs = parsePositiveInteger(readFlagValue(args, index, arg), arg);
        index += 1;
        break;
      case "--debug-ci-budget-ms":
        options.config.ciBudgetMs = parsePositiveInteger(readFlagValue(args, index, arg), arg);
        index += 1;
        break;
      case "--debug-unknown-max":
        options.config.unknownMax = parsePositiveInteger(readFlagValue(args, index, arg), arg);
        index += 1;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!options.repo || !/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    throw new Error("--repo must be in owner/repo form");
  }
  if (!options.pr || !/^\d+$/.test(options.pr)) {
    throw new Error("--pr must be a PR number");
  }
  if (!options.expectedHeadSha || options.expectedHeadSha.trim() === "") {
    throw new Error("--expected-head is required");
  }

  return {
    repo: options.repo,
    pr: options.pr,
    expectedHeadSha: options.expectedHeadSha,
    config: options.config,
  };
}

async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}

async function fetchMergeState(options: CliOptions): Promise<MergeObservation> {
  const response = await ghJson<GhPrViewResponse>([
    "pr",
    "view",
    options.pr,
    "--repo",
    options.repo,
    "--json",
    "headRefOid,baseRefOid,mergeStateStatus",
  ]);

  if (!response.mergeStateStatus) {
    throw new Error("gh pr view did not return mergeStateStatus");
  }

  return {
    mergeState: response.mergeStateStatus,
    headSha: response.headRefOid ?? "",
    baseSha: response.baseRefOid,
  };
}

async function fetchCiState(options: CliOptions, expectedHeadSha: string): Promise<CiObservation> {
  const checkRuns = await ghJson<GhCheckRunsResponse>([
    "api",
    `repos/${options.repo}/commits/${expectedHeadSha}/check-runs`,
  ]);
  const normalizedCheckRuns = normalizeGhCheckRunsForExpectedHead(checkRuns, expectedHeadSha);
  if (normalizedCheckRuns.ciState !== "not_found") {
    return normalizedCheckRuns;
  }

  const statuses = await ghJson<GhCommitStatusResponse>([
    "api",
    `repos/${options.repo}/commits/${expectedHeadSha}/status`,
  ]);
  return normalizeGhCommitStatusesForExpectedHead(statuses, expectedHeadSha);
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseRenovateFreshnessPollArgs(process.argv.slice(2));
  } catch (error) {
    printUsage();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const result = await runRenovateBabysit(
    { expectedHeadSha: options.expectedHeadSha, config: options.config },
    {
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      fetchMergeState: () => fetchMergeState(options),
      fetchCiState: (expectedHeadSha) => fetchCiState(options, expectedHeadSha),
    }
  );

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
