export const FRESHNESS_POLL_INTERVAL_MS = 10_000;
export const FRESHNESS_UNKNOWN_MAX = 3;
export const CI_BABYSIT_BUDGET_MS = 5 * 60_000;

export type MergeState =
  | "CLEAN"
  | "BEHIND"
  | "BLOCKED"
  | "DIRTY"
  | "UNKNOWN"
  | "CONFLICTING"
  | "UNSTABLE"
  | "HAS_HOOKS"
  | (string & {});

export type CiState = "pending" | "success" | "failure" | "not_found" | "ambiguous";

export type MergeObservation = {
  mergeState: MergeState;
  headSha: string;
  baseSha?: string;
  detail?: string;
};

export type CiObservation = {
  ciState: CiState;
  headSha?: string;
  detail?: string;
};

export type RenovateBabysitFailureOutcome =
  | "unknown_exhausted"
  | "budget_exhausted"
  | "merge_query_failed"
  | "ci_query_failed"
  | "ci_failed"
  | "non_clean"
  | "head_changed";

export type RenovateBabysitResult =
  | {
      outcome: "clean";
      headSha: string;
      freshnessRechecks: number;
      ciPolls: number;
      elapsedMs: number;
    }
  | {
      outcome: RenovateBabysitFailureOutcome;
      observedHeadSha?: string;
      mergeState?: MergeState;
      ciState?: CiState;
      freshnessRechecks: number;
      ciPolls: number;
      elapsedMs: number;
      detail?: string;
    };

export type RenovateBabysitConfig = {
  pollIntervalMs?: number;
  unknownMax?: number;
  ciBudgetMs?: number;
};

export type RenovateBabysitDeps = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  fetchMergeState: () => Promise<MergeObservation>;
  fetchCiState: (expectedHeadSha: string) => Promise<CiObservation>;
};

export type RenovateBabysitOptions = {
  expectedHeadSha: string;
  config?: RenovateBabysitConfig;
};

type RuntimeConfig = {
  pollIntervalMs: number;
  unknownMax: number;
  ciBudgetMs: number;
};

type Counters = {
  freshnessRechecks: number;
  ciPolls: number;
};

type PollState = {
  consecutiveUnknown: number;
};

const SUCCESSFUL_CI_STATES = new Set(["success", "neutral"]);
const PENDING_CI_STATUSES = new Set(["pending", "queued", "in_progress", "requested", "waiting"]);
const FAILURE_CI_STATES = new Set([
  "action_required",
  "cancelled",
  "failure",
  "skipped",
  "startup_failure",
  "timed_out",
  "error",
]);

function runtimeConfig(config: RenovateBabysitConfig | undefined): RuntimeConfig {
  return {
    pollIntervalMs: config?.pollIntervalMs ?? FRESHNESS_POLL_INTERVAL_MS,
    unknownMax: config?.unknownMax ?? FRESHNESS_UNKNOWN_MAX,
    ciBudgetMs: config?.ciBudgetMs ?? CI_BABYSIT_BUDGET_MS,
  };
}

function elapsedMs(deps: RenovateBabysitDeps, startMs: number): number {
  return deps.now() - startMs;
}

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isValidHeadSha(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  outcome: RenovateBabysitFailureOutcome,
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters,
  context: {
    observedHeadSha?: string;
    mergeState?: MergeState;
    ciState?: CiState;
    detail?: string;
  } = {}
): RenovateBabysitResult {
  return {
    outcome,
    observedHeadSha: context.observedHeadSha,
    mergeState: context.mergeState,
    ciState: context.ciState,
    freshnessRechecks: counters.freshnessRechecks,
    ciPolls: counters.ciPolls,
    elapsedMs: elapsedMs(deps, startMs),
    detail: context.detail,
  };
}

function clean(
  observation: MergeObservation,
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters
): RenovateBabysitResult {
  return {
    outcome: "clean",
    headSha: observation.headSha,
    freshnessRechecks: counters.freshnessRechecks,
    ciPolls: counters.ciPolls,
    elapsedMs: elapsedMs(deps, startMs),
  };
}

async function fetchMergeObservation(
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters
): Promise<MergeObservation | RenovateBabysitResult> {
  try {
    const observation = await deps.fetchMergeState();
    if (!isValidHeadSha(observation.headSha)) {
      return failure("merge_query_failed", deps, startMs, counters, {
        mergeState: observation.mergeState,
        detail: "merge-state query returned a missing or blank head SHA",
      });
    }
    return observation;
  } catch (error) {
    return failure("merge_query_failed", deps, startMs, counters, {
      detail: detailFromError(error),
    });
  }
}

function validateExpectedHead(
  observation: MergeObservation,
  expectedHeadSha: string,
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters
): RenovateBabysitResult | null {
  if (observation.headSha !== expectedHeadSha) {
    return failure("head_changed", deps, startMs, counters, {
      observedHeadSha: observation.headSha,
      mergeState: observation.mergeState,
      detail: `expected ${expectedHeadSha}, observed ${observation.headSha}`,
    });
  }
  return null;
}

function canContinueWithinBudget(
  deps: RenovateBabysitDeps,
  ciBudgetStartedAtMs: number | undefined,
  config: RuntimeConfig
): boolean {
  if (ciBudgetStartedAtMs === undefined) {
    return true;
  }
  return deps.now() - ciBudgetStartedAtMs < config.ciBudgetMs;
}

function canSleepWithinBudget(
  deps: RenovateBabysitDeps,
  ciBudgetStartedAtMs: number | undefined,
  config: RuntimeConfig
): boolean {
  if (ciBudgetStartedAtMs === undefined) {
    return true;
  }
  return deps.now() - ciBudgetStartedAtMs + config.pollIntervalMs <= config.ciBudgetMs;
}

async function sleepBeforeNextObservation(
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters,
  ciBudgetStartedAtMs: number | undefined,
  config: RuntimeConfig
): Promise<RenovateBabysitResult | null> {
  if (!canSleepWithinBudget(deps, ciBudgetStartedAtMs, config)) {
    return failure("budget_exhausted", deps, startMs, counters, {
      detail: "remaining CI babysit budget is shorter than the polling interval",
    });
  }
  await deps.sleep(config.pollIntervalMs);
  return null;
}

async function fetchCiObservation(
  deps: RenovateBabysitDeps,
  expectedHeadSha: string,
  startMs: number,
  counters: Counters
): Promise<CiObservation | RenovateBabysitResult> {
  try {
    const observation = await deps.fetchCiState(expectedHeadSha);
    counters.ciPolls += 1;
    if (
      observation.headSha !== undefined &&
      observation.headSha.trim() !== "" &&
      observation.headSha !== expectedHeadSha
    ) {
      return failure("ci_query_failed", deps, startMs, counters, {
        observedHeadSha: observation.headSha,
        ciState: observation.ciState,
        detail: `CI result was for ${observation.headSha}, expected ${expectedHeadSha}`,
      });
    }
    return observation;
  } catch (error) {
    counters.ciPolls += 1;
    return failure("ci_query_failed", deps, startMs, counters, {
      detail: detailFromError(error),
    });
  }
}

async function fetchMergeAfterCiSuccess(
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters,
  expectedHeadSha: string,
  ciBudgetStartedAtMs: number,
  config: RuntimeConfig
): Promise<MergeObservation | RenovateBabysitResult> {
  if (!canContinueWithinBudget(deps, ciBudgetStartedAtMs, config)) {
    return failure("budget_exhausted", deps, startMs, counters);
  }

  counters.freshnessRechecks += 1;
  const observation = await fetchMergeObservation(deps, startMs, counters);
  if ("outcome" in observation) {
    return observation;
  }

  const headValidation = validateExpectedHead(
    observation,
    expectedHeadSha,
    deps,
    startMs,
    counters
  );
  return headValidation ?? observation;
}

function isFailureResult(
  value: MergeObservation | RenovateBabysitResult
): value is RenovateBabysitResult {
  return "outcome" in value;
}

function isNonCleanState(mergeState: MergeState): boolean {
  return mergeState !== "CLEAN" && mergeState !== "UNKNOWN" && mergeState !== "BLOCKED";
}

function handleUnknownObservation(
  observation: MergeObservation,
  state: PollState,
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters,
  config: RuntimeConfig
): RenovateBabysitResult | null {
  state.consecutiveUnknown += 1;
  if (state.consecutiveUnknown >= config.unknownMax) {
    return failure("unknown_exhausted", deps, startMs, counters, {
      observedHeadSha: observation.headSha,
      mergeState: observation.mergeState,
    });
  }
  return null;
}

async function handleCiForBlocked(
  deps: RenovateBabysitDeps,
  startMs: number,
  counters: Counters,
  state: PollState,
  expectedHeadSha: string,
  config: RuntimeConfig,
  ciBudgetStartedAtMs: number
): Promise<{ continuePolling: true } | RenovateBabysitResult> {
  if (!canContinueWithinBudget(deps, ciBudgetStartedAtMs, config)) {
    return failure("budget_exhausted", deps, startMs, counters);
  }

  const ciObservation = await fetchCiObservation(deps, expectedHeadSha, startMs, counters);
  if ("outcome" in ciObservation) {
    return ciObservation;
  }

  switch (ciObservation.ciState) {
    case "pending":
    case "not_found":
      return { continuePolling: true };
    case "failure":
      return failure("ci_failed", deps, startMs, counters, {
        ciState: ciObservation.ciState,
        detail: ciObservation.detail,
      });
    case "ambiguous":
      return failure("ci_query_failed", deps, startMs, counters, {
        ciState: ciObservation.ciState,
        detail: ciObservation.detail,
      });
    case "success": {
      const followUpObservation = await fetchMergeAfterCiSuccess(
        deps,
        startMs,
        counters,
        expectedHeadSha,
        ciBudgetStartedAtMs,
        config
      );
      if (isFailureResult(followUpObservation)) {
        return followUpObservation;
      }
      if (followUpObservation.mergeState === "CLEAN") {
        return clean(followUpObservation, deps, startMs, counters);
      }
      if (isNonCleanState(followUpObservation.mergeState)) {
        return failure("non_clean", deps, startMs, counters, {
          observedHeadSha: followUpObservation.headSha,
          mergeState: followUpObservation.mergeState,
          detail: followUpObservation.detail,
        });
      }
      if (followUpObservation.mergeState === "UNKNOWN") {
        const unknownFailure = handleUnknownObservation(
          followUpObservation,
          state,
          deps,
          startMs,
          counters,
          config
        );
        if (unknownFailure) {
          return unknownFailure;
        }
      } else {
        state.consecutiveUnknown = 0;
      }
      return { continuePolling: true };
    }
  }
}

export async function runRenovateBabysit(
  options: RenovateBabysitOptions,
  deps: RenovateBabysitDeps
): Promise<RenovateBabysitResult> {
  const config = runtimeConfig(options.config);
  const expectedHeadSha = options.expectedHeadSha.trim();
  const startMs = deps.now();
  const counters: Counters = { freshnessRechecks: 0, ciPolls: 0 };

  if (expectedHeadSha === "") {
    return failure("merge_query_failed", deps, startMs, counters, {
      detail: "expectedHeadSha is required",
    });
  }

  const state: PollState = { consecutiveUnknown: 0 };
  let ciBudgetStartedAtMs: number | undefined;
  let hasObservedMergeState = false;

  while (true) {
    if (!canContinueWithinBudget(deps, ciBudgetStartedAtMs, config)) {
      return failure("budget_exhausted", deps, startMs, counters);
    }

    if (hasObservedMergeState) {
      counters.freshnessRechecks += 1;
    }

    const observation = await fetchMergeObservation(deps, startMs, counters);
    if (isFailureResult(observation)) {
      return observation;
    }
    hasObservedMergeState = true;

    const headValidation = validateExpectedHead(
      observation,
      expectedHeadSha,
      deps,
      startMs,
      counters
    );
    if (headValidation) {
      return headValidation;
    }

    switch (observation.mergeState) {
      case "CLEAN":
        return clean(observation, deps, startMs, counters);
      case "UNKNOWN": {
        const unknownFailure = handleUnknownObservation(
          observation,
          state,
          deps,
          startMs,
          counters,
          config
        );
        if (unknownFailure) {
          return unknownFailure;
        }
        const sleepFailure = await sleepBeforeNextObservation(
          deps,
          startMs,
          counters,
          ciBudgetStartedAtMs,
          config
        );
        if (sleepFailure) {
          return sleepFailure;
        }
        break;
      }
      case "BLOCKED": {
        state.consecutiveUnknown = 0;
        ciBudgetStartedAtMs ??= deps.now();
        const ciResult = await handleCiForBlocked(
          deps,
          startMs,
          counters,
          state,
          expectedHeadSha,
          config,
          ciBudgetStartedAtMs
        );
        if ("outcome" in ciResult) {
          return ciResult;
        }
        const sleepFailure = await sleepBeforeNextObservation(
          deps,
          startMs,
          counters,
          ciBudgetStartedAtMs,
          config
        );
        if (sleepFailure) {
          return sleepFailure;
        }
        break;
      }
      default:
        return failure("non_clean", deps, startMs, counters, {
          observedHeadSha: observation.headSha,
          mergeState: observation.mergeState,
          detail: observation.detail,
        });
    }
  }
}

export type GhCheckRun = {
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_sha?: string;
};

export type GhCheckRunsResponse = {
  check_runs?: GhCheckRun[];
};

export type GhCommitStatus = {
  context?: string;
  state?: string;
  sha?: string;
};

export type GhCommitStatusResponse = {
  statuses?: GhCommitStatus[];
  sha?: string;
};

function isRequiredPrCiName(name: string | undefined): boolean {
  return name === "test" || name === "CI / test";
}

function mergeCiStates(states: CiState[]): CiState {
  if (states.length === 0) {
    return "not_found";
  }
  if (states.includes("ambiguous")) {
    return "ambiguous";
  }
  if (states.includes("failure")) {
    return "failure";
  }
  if (states.includes("pending") || states.includes("not_found")) {
    return "pending";
  }
  return "success";
}

export function normalizeGhCheckRunsForExpectedHead(
  response: GhCheckRunsResponse,
  expectedHeadSha: string
): CiObservation {
  const runs = (response.check_runs ?? []).filter((run) => isRequiredPrCiName(run.name));
  if (runs.length === 0) {
    return { ciState: "not_found", headSha: expectedHeadSha };
  }

  const states: CiState[] = [];
  for (const run of runs) {
    if (run.head_sha !== undefined && run.head_sha !== expectedHeadSha) {
      return {
        ciState: "ambiguous",
        headSha: run.head_sha,
        detail: `check run ${run.name ?? "(unnamed)"} is for ${run.head_sha}, expected ${expectedHeadSha}`,
      };
    }

    const status = run.status?.toLowerCase();
    const conclusion = run.conclusion?.toLowerCase() ?? undefined;

    if (status !== "completed") {
      states.push(PENDING_CI_STATUSES.has(status ?? "") ? "pending" : "ambiguous");
      continue;
    }
    if (conclusion !== undefined && SUCCESSFUL_CI_STATES.has(conclusion)) {
      states.push("success");
      continue;
    }
    if (conclusion !== undefined && FAILURE_CI_STATES.has(conclusion)) {
      states.push("failure");
      continue;
    }
    states.push("ambiguous");
  }

  return { ciState: mergeCiStates(states), headSha: expectedHeadSha };
}

export function normalizeGhCommitStatusesForExpectedHead(
  response: GhCommitStatusResponse,
  expectedHeadSha: string
): CiObservation {
  if (response.sha !== undefined && response.sha !== expectedHeadSha) {
    return {
      ciState: "ambiguous",
      headSha: response.sha,
      detail: `commit status response is for ${response.sha}, expected ${expectedHeadSha}`,
    };
  }

  const statuses = (response.statuses ?? []).filter((status) => isRequiredPrCiName(status.context));
  if (statuses.length === 0) {
    return { ciState: "not_found", headSha: expectedHeadSha };
  }

  const states = statuses.map<CiState>((status) => {
    if (status.sha !== undefined && status.sha !== expectedHeadSha) {
      return "ambiguous";
    }
    switch (status.state?.toLowerCase()) {
      case "success":
        return "success";
      case "pending":
        return "pending";
      case "failure":
      case "error":
        return "failure";
      default:
        return "ambiguous";
    }
  });

  return { ciState: mergeCiStates(states), headSha: expectedHeadSha };
}
