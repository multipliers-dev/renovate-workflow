import { describe, expect, it } from "vitest";

import { parseRenovateFreshnessPollArgs } from "./renovate-freshness-poll.js";
import {
  normalizeGhCheckRunsForExpectedHead,
  runRenovateBabysit,
  type CiObservation,
  type MergeObservation,
  type RenovateBabysitConfig,
  type RenovateBabysitDeps,
} from "./lib/renovate-freshness-poll.js";

type ScriptedDeps = RenovateBabysitDeps & {
  sleeps: number[];
  mergeFetches: number;
  ciFetches: number;
};

type MergeScriptItem = MergeObservation | Error;
type CiScriptItem = CiObservation | Error;

const HEAD_SHA = "expected-head-sha";

function merge(mergeState: string, headSha = HEAD_SHA): MergeObservation {
  return { mergeState, headSha };
}

function ci(ciState: CiObservation["ciState"], headSha = HEAD_SHA): CiObservation {
  return { ciState, headSha };
}

function makeDeps({
  mergeStates,
  ciStates = [],
  startMs = 0,
}: {
  mergeStates: MergeScriptItem[];
  ciStates?: CiScriptItem[];
  startMs?: number;
}): ScriptedDeps {
  let nowMs = startMs;
  let mergeFetches = 0;
  let ciFetches = 0;
  const sleeps: number[] = [];
  const mergeQueue = [...mergeStates];
  const ciQueue = [...ciStates];

  return {
    get sleeps() {
      return sleeps;
    },
    get mergeFetches() {
      return mergeFetches;
    },
    get ciFetches() {
      return ciFetches;
    },
    now: () => nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowMs += ms;
    },
    fetchMergeState: async () => {
      mergeFetches += 1;
      const next = mergeQueue.shift();
      if (next === undefined) {
        throw new Error("merge script exhausted");
      }
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    fetchCiState: async () => {
      ciFetches += 1;
      const next = ciQueue.shift();
      if (next === undefined) {
        throw new Error("ci script exhausted");
      }
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
}

async function run(
  deps: RenovateBabysitDeps,
  config?: RenovateBabysitConfig,
  expectedHeadSha = HEAD_SHA
) {
  return runRenovateBabysit({ expectedHeadSha, config }, deps);
}

describe("renovate freshness polling", () => {
  it("returns clean immediately without polling", async () => {
    const deps = makeDeps({ mergeStates: [merge("CLEAN")] });

    const result = await run(deps);

    expect(result).toEqual({
      outcome: "clean",
      headSha: HEAD_SHA,
      freshnessRechecks: 0,
      ciPolls: 0,
      elapsedMs: 0,
    });
    expect(deps.sleeps).toEqual([]);
    expect(deps.ciFetches).toBe(0);
  });

  it("stops after exactly three consecutive UNKNOWN observations", async () => {
    const deps = makeDeps({
      mergeStates: [merge("UNKNOWN"), merge("UNKNOWN"), merge("UNKNOWN")],
    });

    const result = await run(deps);

    expect(result.outcome).toBe("unknown_exhausted");
    expect(result.freshnessRechecks).toBe(2);
    expect(result.elapsedMs).toBe(20_000);
    expect(deps.sleeps).toEqual([10_000, 10_000]);
  });

  it("resets the consecutive UNKNOWN counter on BLOCKED", async () => {
    const deps = makeDeps({
      mergeStates: [
        merge("UNKNOWN"),
        merge("UNKNOWN"),
        merge("BLOCKED"),
        merge("UNKNOWN"),
        merge("UNKNOWN"),
        merge("CLEAN"),
      ],
      ciStates: [ci("pending")],
    });

    const result = await run(deps);

    expect(result.outcome).toBe("clean");
    if (result.outcome === "clean") {
      expect(result.headSha).toBe(HEAD_SHA);
    }
    expect(result.freshnessRechecks).toBe(5);
    expect(result.ciPolls).toBe(1);
  });

  it("returns merge_query_failed on a merge-state query exception", async () => {
    const deps = makeDeps({ mergeStates: [new Error("GitHub unavailable")] });

    const result = await run(deps);

    expect(result.outcome).toBe("merge_query_failed");
    if (result.outcome !== "clean") {
      expect(result.detail).toContain("GitHub unavailable");
    }
  });

  it("returns merge_query_failed on malformed merge-state head data", async () => {
    const deps = makeDeps({
      mergeStates: [{ mergeState: "CLEAN", headSha: "" }],
    });

    const result = await run(deps);

    expect(result.outcome).toBe("merge_query_failed");
  });

  it("returns head_changed before clean when CLEAN is for a different head", async () => {
    const deps = makeDeps({ mergeStates: [merge("CLEAN", "different-head")] });

    const result = await run(deps);

    expect(result.outcome).toBe("head_changed");
    if (result.outcome !== "clean") {
      expect(result.observedHeadSha).toBe("different-head");
      expect(result).not.toHaveProperty("headSha");
    }
  });

  it("returns non_clean for definitive non-pollable merge states", async () => {
    const deps = makeDeps({ mergeStates: [merge("HAS_HOOKS")] });

    const result = await run(deps);

    expect(result.outcome).toBe("non_clean");
    if (result.outcome !== "clean") {
      expect(result.mergeState).toBe("HAS_HOOKS");
    }
  });

  it("treats pending or not-found CI as pollable within the budget", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED"), merge("BLOCKED"), merge("CLEAN")],
      ciStates: [ci("not_found"), ci("pending")],
    });

    const result = await run(deps, { pollIntervalMs: 10, ciBudgetMs: 100 });

    expect(result.outcome).toBe("clean");
    expect(result.ciPolls).toBe(2);
    expect(deps.sleeps).toEqual([10, 10]);
  });

  it("returns clean after CI success and a fresh CLEAN merge-state query", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED"), merge("CLEAN")],
      ciStates: [ci("success")],
    });

    const result = await run(deps);

    expect(result).toEqual({
      outcome: "clean",
      headSha: HEAD_SHA,
      freshnessRechecks: 1,
      ciPolls: 1,
      elapsedMs: 0,
    });
  });

  it("does not reset the CI budget after repeated CI success with continued BLOCKED", async () => {
    const deps = makeDeps({
      mergeStates: [
        merge("BLOCKED"),
        merge("BLOCKED"),
        merge("BLOCKED"),
        merge("BLOCKED"),
        merge("BLOCKED"),
        merge("BLOCKED"),
      ],
      ciStates: [ci("success"), ci("success"), ci("success")],
    });

    const result = await run(deps, { pollIntervalMs: 10, ciBudgetMs: 25 });

    expect(result.outcome).toBe("budget_exhausted");
    expect(result.elapsedMs).toBe(20);
    expect(result.ciPolls).toBe(3);
  });

  it("counts UNKNOWN returned by the post-CI-success merge-state query", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED"), merge("UNKNOWN"), merge("UNKNOWN"), merge("UNKNOWN")],
      ciStates: [ci("success")],
    });

    const result = await run(deps);

    expect(result.outcome).toBe("unknown_exhausted");
    expect(result.freshnessRechecks).toBe(3);
    expect(result.ciPolls).toBe(1);
    expect(deps.mergeFetches).toBe(4);
  });

  it("checks the CI budget before another fetch when deadline is reached", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED"), merge("BLOCKED"), merge("BLOCKED")],
      ciStates: [ci("pending"), ci("pending"), ci("pending")],
    });

    const result = await run(deps, { pollIntervalMs: 10, ciBudgetMs: 20 });

    expect(result.outcome).toBe("budget_exhausted");
    expect(result.elapsedMs).toBe(20);
    expect(deps.mergeFetches).toBe(2);
    expect(deps.ciFetches).toBe(2);
  });

  it("does not sleep when the next sleep would overshoot the CI deadline", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED"), merge("BLOCKED"), merge("BLOCKED")],
      ciStates: [ci("pending"), ci("pending"), ci("pending")],
    });

    const result = await run(deps, { pollIntervalMs: 10, ciBudgetMs: 25 });

    expect(result.outcome).toBe("budget_exhausted");
    expect(result.elapsedMs).toBe(20);
    expect(deps.sleeps).toEqual([10, 10]);
    expect(deps.mergeFetches).toBe(3);
  });

  it("starts the CI budget at the first qualifying BLOCKED, not helper invocation", async () => {
    const deps = makeDeps({
      mergeStates: [merge("UNKNOWN"), merge("BLOCKED"), merge("CLEAN")],
      ciStates: [ci("pending")],
    });

    const result = await run(deps, { pollIntervalMs: 10, ciBudgetMs: 10 });

    expect(result.outcome).toBe("budget_exhausted");
    expect(result.elapsedMs).toBe(20);
    expect(deps.mergeFetches).toBe(2);
  });

  it("returns ci_failed for failed CI", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED")],
      ciStates: [ci("failure")],
    });

    const result = await run(deps);

    expect(result.outcome).toBe("ci_failed");
  });

  it("returns ci_query_failed for ambiguous CI", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED")],
      ciStates: [ci("ambiguous")],
    });

    const result = await run(deps);

    expect(result.outcome).toBe("ci_query_failed");
  });

  it("rejects stale-SHA CI success", async () => {
    const deps = makeDeps({
      mergeStates: [merge("BLOCKED")],
      ciStates: [ci("success", "other-head")],
    });

    const result = await run(deps);

    expect(result.outcome).toBe("ci_query_failed");
    if (result.outcome !== "clean") {
      expect(result.observedHeadSha).toBe("other-head");
    }
  });
});

describe("renovate freshness GitHub normalization", () => {
  it("normalizes check-run success for the expected head", () => {
    const result = normalizeGhCheckRunsForExpectedHead(
      {
        check_runs: [
          { name: "test", status: "completed", conclusion: "success", head_sha: HEAD_SHA },
        ],
      },
      HEAD_SHA
    );

    expect(result).toEqual({ ciState: "success", headSha: HEAD_SHA });
  });

  it("normalizes absent required check-runs as not_found", () => {
    const result = normalizeGhCheckRunsForExpectedHead({ check_runs: [] }, HEAD_SHA);

    expect(result).toEqual({ ciState: "not_found", headSha: HEAD_SHA });
  });

  it("rejects check-run success for a different head as ambiguous", () => {
    const result = normalizeGhCheckRunsForExpectedHead(
      {
        check_runs: [
          { name: "test", status: "completed", conclusion: "success", head_sha: "stale-head" },
        ],
      },
      HEAD_SHA
    );

    expect(result.ciState).toBe("ambiguous");
    expect(result.headSha).toBe("stale-head");
  });
});

describe("renovate freshness CLI args", () => {
  it("parses required args and debug-only overrides", () => {
    const result = parseRenovateFreshnessPollArgs([
      "--repo",
      "owner/repo",
      "--pr",
      "123",
      "--expected-head",
      HEAD_SHA,
      "--debug-poll-interval-ms",
      "1",
      "--debug-ci-budget-ms",
      "2",
      "--debug-unknown-max",
      "3",
    ]);

    expect(result).toEqual({
      repo: "owner/repo",
      pr: "123",
      expectedHeadSha: HEAD_SHA,
      config: { pollIntervalMs: 1, ciBudgetMs: 2, unknownMax: 3 },
    });
  });
});
