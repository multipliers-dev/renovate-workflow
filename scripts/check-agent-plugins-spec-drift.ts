#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPublishedSchemaUrl,
  confirmPublishedUpstreamVersion,
  evaluateSpecRelationship,
  parseDeclaredSpecVersion,
  parsePublishedSpecVersion,
  PUBLISHED_SPEC_MD_URL,
  type SpecRelationshipEvaluation,
} from "./lib/agent-plugins-spec.js";

const REPO_ROOT = join(import.meta.dirname, "..");

export type DriftCheckResult = SpecRelationshipEvaluation & {
  advisory: true;
  declaredSchemaUrl: string;
  publishedSpecUrl: string;
  publishedSchemaUrl: string;
};

export type DriftCheckDeps = {
  fetch: typeof fetch;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
};

export type ParsedDriftCheckArgs = {
  pluginJsonPath: string;
  jsonOutput: boolean;
};

function printUsage(): void {
  console.error(`Usage: npm run check:agent-plugins-spec-drift -- [--plugin-json <path>] [--json]

Advisory check: compare local plugin.json $schema against the latest published Agent Plugins spec.

Options:
  --plugin-json <path>  Path to plugin.json (default: ./plugin.json)
  --json                Print machine-readable JSON to stdout
  --help, -h            Show this help
`);
}

function readFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseAgentPluginsSpecDriftArgs(args: string[]): ParsedDriftCheckArgs {
  const options: ParsedDriftCheckArgs = {
    pluginJsonPath: join(REPO_ROOT, "plugin.json"),
    jsonOutput: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--plugin-json":
        options.pluginJsonPath = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--json":
        options.jsonOutput = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function readDeclaredSchemaUrl(
  pluginJsonPath: string,
  readFile: DriftCheckDeps["readFileSync"],
): string {
  let manifestRaw: string;
  try {
    manifestRaw = readFile(pluginJsonPath, "utf8");
  } catch {
    throw new Error(`failed to read plugin manifest at ${pluginJsonPath}`);
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  } catch {
    throw new Error(`malformed plugin manifest JSON at ${pluginJsonPath}`);
  }

  if (typeof manifest.$schema !== "string" || manifest.$schema.trim() === "") {
    throw new Error(`plugin manifest at ${pluginJsonPath} is missing $schema`);
  }

  return manifest.$schema;
}

async function fetchText(url: string, deps: DriftCheckDeps): Promise<string> {
  let response: Response;
  try {
    response = await deps.fetch(url);
  } catch (error) {
    throw new Error(
      `failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(`upstream fetch failed for ${url}: HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchSchemaHttpStatus(schemaUrl: string, deps: DriftCheckDeps): Promise<number> {
  let response: Response;
  try {
    response = await deps.fetch(schemaUrl, { method: "HEAD" });
  } catch (error) {
    throw new Error(
      `failed to fetch ${schemaUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.status === 405 || response.status === 501) {
    response = await deps.fetch(schemaUrl, { method: "GET" });
  }

  return response.status;
}

export async function runAgentPluginsSpecDriftCheck(
  options: ParsedDriftCheckArgs,
  deps: DriftCheckDeps = {
    fetch: globalThis.fetch,
    readFileSync: (path, encoding) => readFileSync(path, encoding),
  },
): Promise<DriftCheckResult> {
  const declaredSchemaUrl = readDeclaredSchemaUrl(options.pluginJsonPath, deps.readFileSync);
  const declaredVersion = parseDeclaredSpecVersion(declaredSchemaUrl);

  const specMarkdown = await fetchText(PUBLISHED_SPEC_MD_URL, deps);
  const markdownVersion = parsePublishedSpecVersion(specMarkdown);
  const publishedSchemaUrl = buildPublishedSchemaUrl(markdownVersion);
  const schemaHttpStatus = await fetchSchemaHttpStatus(publishedSchemaUrl, deps);

  const latestPublishedVersion = confirmPublishedUpstreamVersion({
    markdownVersion,
    schemaVersion: markdownVersion,
    schemaHttpStatus,
  });

  const evaluation = evaluateSpecRelationship({
    declared: declaredVersion,
    published: latestPublishedVersion,
  });

  return {
    ...evaluation,
    advisory: true,
    declaredSchemaUrl,
    publishedSpecUrl: "https://agent-plugins.org/specification",
    publishedSchemaUrl,
  };
}

function formatHumanSummary(result: DriftCheckResult): string {
  return [
    `Declared Agent Plugins spec: ${result.declaredVersion}`,
    `Latest published upstream spec: ${result.latestPublishedVersion}`,
    `Relationship: ${result.relationship}`,
    `Drift detected: ${result.driftDetected ? "yes" : "no"} (advisory only)`,
  ].join("\n");
}

async function main(): Promise<void> {
  let options: ParsedDriftCheckArgs;
  try {
    options = parseAgentPluginsSpecDriftArgs(process.argv.slice(2));
  } catch (error) {
    printUsage();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  try {
    const result = await runAgentPluginsSpecDriftCheck(options);
    if (options.jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatHumanSummary(result));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
