import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runAgentPluginsSpecDriftCheck } from "./check-agent-plugins-spec-drift.js";
import {
  buildPublishedSchemaUrl,
  compareSemver,
  confirmPublishedUpstreamVersion,
  evaluateSpecRelationship,
  parseDeclaredSpecVersion,
  parsePublishedSpecVersion,
  PUBLISHED_SPEC_MD_URL,
} from "./lib/agent-plugins-spec.js";

const PUBLISHED_SPEC_FIXTURE = `# Agent Plugins Specification

**Spec Version: 1.0.0**

**Status: Published**
`;

const PUBLISHED_SPEC_FIXTURE_1_1 = `# Agent Plugins Specification

**Spec Version: 1.1.0**

**Status: Published**
`;

function writePluginJson(dir: string, schemaUrl: string): string {
  const pluginJsonPath = join(dir, "plugin.json");
  writeFileSync(
    pluginJsonPath,
    JSON.stringify({ $schema: schemaUrl, name: "test-plugin", version: "0.0.0" }, null, 2),
  );
  return pluginJsonPath;
}

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    const handler = handlers[key] ?? handlers[url];
    if (!handler) {
      throw new Error(`unexpected fetch: ${key}`);
    }
    return handler();
  }) as typeof fetch;
}

describe("agent-plugins-spec library", () => {
  it("parses declared version from $schema URL", () => {
    expect(
      parseDeclaredSpecVersion("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"),
    ).toBe("1.0.0");
  });

  it("throws on malformed $schema URL", () => {
    expect(() => parseDeclaredSpecVersion("https://example.com/schema.json")).toThrow(
      /malformed \$schema URL/,
    );
  });

  it("parses published version when Status is Published", () => {
    expect(parsePublishedSpecVersion(PUBLISHED_SPEC_FIXTURE)).toBe("1.0.0");
  });

  it("throws when upstream markdown is not Published", () => {
    expect(() =>
      parsePublishedSpecVersion(`# Agent Plugins Specification\n\n**Spec Version: 1.1.0**\n`),
    ).toThrow(/Status: Published/);
  });

  it("throws when upstream markdown is missing Spec Version", () => {
    expect(() =>
      parsePublishedSpecVersion(`# Agent Plugins Specification\n\n**Status: Published**\n`),
    ).toThrow(/Spec Version/);
  });

  it("compares semver values", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    expect(compareSemver("1.2.0", "1.1.0")).toBe(1);
  });

  it("evaluates current relationship", () => {
    expect(evaluateSpecRelationship({ declared: "1.0.0", published: "1.0.0" })).toEqual({
      declaredVersion: "1.0.0",
      latestPublishedVersion: "1.0.0",
      relationship: "current",
      driftDetected: false,
    });
  });

  it("evaluates behind relationship for newer upstream minor", () => {
    expect(evaluateSpecRelationship({ declared: "1.0.0", published: "1.1.0" })).toEqual({
      declaredVersion: "1.0.0",
      latestPublishedVersion: "1.1.0",
      relationship: "behind",
      driftDetected: true,
    });
  });

  it("evaluates behind relationship for newer upstream major", () => {
    expect(evaluateSpecRelationship({ declared: "1.0.0", published: "2.0.0" })).toEqual({
      declaredVersion: "1.0.0",
      latestPublishedVersion: "2.0.0",
      relationship: "behind",
      driftDetected: true,
    });
  });

  it("evaluates ahead relationship when local version exceeds published", () => {
    expect(evaluateSpecRelationship({ declared: "1.2.0", published: "1.1.0" })).toEqual({
      declaredVersion: "1.2.0",
      latestPublishedVersion: "1.1.0",
      relationship: "ahead",
      driftDetected: false,
    });
  });

  it("builds published schema URLs", () => {
    expect(buildPublishedSchemaUrl("1.0.0")).toBe(
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
  });

  it("confirms dual published signals when markdown and schema agree", () => {
    expect(
      confirmPublishedUpstreamVersion({
        markdownVersion: "1.0.0",
        schemaVersion: "1.0.0",
        schemaHttpStatus: 200,
      }),
    ).toBe("1.0.0");
  });

  it("throws on published signal mismatch", () => {
    expect(() =>
      confirmPublishedUpstreamVersion({
        markdownVersion: "1.0.0",
        schemaVersion: "1.1.0",
        schemaHttpStatus: 200,
      }),
    ).toThrow(/published signal mismatch/);
  });

  it("throws when published schema URL is non-200", () => {
    expect(() =>
      confirmPublishedUpstreamVersion({
        markdownVersion: "1.1.0",
        schemaVersion: "1.1.0",
        schemaHttpStatus: 404,
      }),
    ).toThrow(/published schema URL returned HTTP 404/);
  });
});

describe("check-agent-plugins-spec-drift CLI", () => {
  it("returns current relationship when both published signals agree", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-plugins-spec-"));
    const pluginJsonPath = writePluginJson(
      tempDir,
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
    const schemaUrl = buildPublishedSchemaUrl("1.0.0");

    const result = await runAgentPluginsSpecDriftCheck(
      { pluginJsonPath, jsonOutput: true },
      {
        readFileSync,
        fetch: mockFetch({
          [PUBLISHED_SPEC_MD_URL]: () => new Response(PUBLISHED_SPEC_FIXTURE, { status: 200 }),
          [`HEAD ${schemaUrl}`]: () => new Response(null, { status: 200 }),
        }),
      },
    );

    expect(result.relationship).toBe("current");
    expect(result.driftDetected).toBe(false);
    expect(result.advisory).toBe(true);
  });

  it("returns behind relationship when upstream is newer", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-plugins-spec-"));
    const pluginJsonPath = writePluginJson(
      tempDir,
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
    const schemaUrl = buildPublishedSchemaUrl("1.1.0");

    const result = await runAgentPluginsSpecDriftCheck(
      { pluginJsonPath, jsonOutput: true },
      {
        readFileSync,
        fetch: mockFetch({
          [PUBLISHED_SPEC_MD_URL]: () => new Response(PUBLISHED_SPEC_FIXTURE_1_1, { status: 200 }),
          [`HEAD ${schemaUrl}`]: () => new Response(null, { status: 200 }),
        }),
      },
    );

    expect(result.relationship).toBe("behind");
    expect(result.driftDetected).toBe(true);
  });

  it("returns ahead relationship when declared version exceeds published", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-plugins-spec-"));
    const pluginJsonPath = writePluginJson(
      tempDir,
      "https://agent-plugins.org/schemas/1.2.0/plugin.schema.json",
    );
    const schemaUrl = buildPublishedSchemaUrl("1.1.0");

    const result = await runAgentPluginsSpecDriftCheck(
      { pluginJsonPath, jsonOutput: true },
      {
        readFileSync,
        fetch: mockFetch({
          [PUBLISHED_SPEC_MD_URL]: () => new Response(PUBLISHED_SPEC_FIXTURE_1_1, { status: 200 }),
          [`HEAD ${schemaUrl}`]: () => new Response(null, { status: 200 }),
        }),
      },
    );

    expect(result.relationship).toBe("ahead");
    expect(result.driftDetected).toBe(false);
  });

  it("fails when local $schema is malformed", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-plugins-spec-"));
    const pluginJsonPath = writePluginJson(tempDir, "https://example.com/schema.json");

    await expect(
      runAgentPluginsSpecDriftCheck(
        { pluginJsonPath, jsonOutput: true },
        {
          readFileSync,
          fetch: mockFetch({}),
        },
      ),
    ).rejects.toThrow(/malformed \$schema URL/);
  });

  it("fails when upstream markdown is not Published", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-plugins-spec-"));
    const pluginJsonPath = writePluginJson(
      tempDir,
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );

    await expect(
      runAgentPluginsSpecDriftCheck(
        { pluginJsonPath, jsonOutput: true },
        {
          readFileSync,
          fetch: mockFetch({
            [PUBLISHED_SPEC_MD_URL]: () =>
              new Response(`# Agent Plugins Specification\n\n**Spec Version: 1.1.0**\n`, {
                status: 200,
              }),
          }),
        },
      ),
    ).rejects.toThrow(/Status: Published/);
  });

  it("fails when markdown says Published but schema URL is non-200", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-plugins-spec-"));
    const pluginJsonPath = writePluginJson(
      tempDir,
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
    const schemaUrl = buildPublishedSchemaUrl("1.1.0");

    await expect(
      runAgentPluginsSpecDriftCheck(
        { pluginJsonPath, jsonOutput: true },
        {
          readFileSync,
          fetch: mockFetch({
            [PUBLISHED_SPEC_MD_URL]: () => new Response(PUBLISHED_SPEC_FIXTURE_1_1, { status: 200 }),
            [`HEAD ${schemaUrl}`]: () => new Response(null, { status: 404 }),
          }),
        },
      ),
    ).rejects.toThrow(/published schema URL returned HTTP 404/);
  });

  it("fails on upstream fetch failure", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-plugins-spec-"));
    const pluginJsonPath = writePluginJson(
      tempDir,
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );

    await expect(
      runAgentPluginsSpecDriftCheck(
        { pluginJsonPath, jsonOutput: true },
        {
          readFileSync,
          fetch: mockFetch({
            [PUBLISHED_SPEC_MD_URL]: () => new Response("upstream unavailable", { status: 503 }),
          }),
        },
      ),
    ).rejects.toThrow(/upstream fetch failed/);
  });
});
