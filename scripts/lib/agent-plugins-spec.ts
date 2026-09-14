export const AGENT_PLUGINS_SCHEMA_BASE = "https://agent-plugins.org/schemas";
export const PUBLISHED_SPEC_MD_URL = "https://agent-plugins.org/specification.md";

const DECLARED_SCHEMA_PATTERN =
  /^https:\/\/agent-plugins\.org\/schemas\/(\d+\.\d+\.\d+)\/plugin\.schema\.json$/;

const PUBLISHED_SPEC_VERSION_PATTERN = /^\*\*Spec Version:\s*(\d+\.\d+\.\d+)\s*\*\*$/m;
const PUBLISHED_STATUS_PATTERN = /^\*\*Status:\s*Published\s*\*\*$/m;

export type SpecVersionRelationship = "behind" | "current" | "ahead";

export type SpecRelationshipEvaluation = {
  declaredVersion: string;
  latestPublishedVersion: string;
  relationship: SpecVersionRelationship;
  driftDetected: boolean;
};

export type PublishedSignalConfirmation = {
  markdownVersion: string;
  schemaVersion: string;
  schemaHttpStatus: number;
};

export function buildPublishedSchemaUrl(version: string): string {
  return `${AGENT_PLUGINS_SCHEMA_BASE}/${version}/plugin.schema.json`;
}

export function parseDeclaredSpecVersion($schema: string): string {
  const match = DECLARED_SCHEMA_PATTERN.exec($schema);
  if (!match) {
    throw new Error(
      `malformed $schema URL: expected https://agent-plugins.org/schemas/X.Y.Z/plugin.schema.json`,
    );
  }
  return match[1]!;
}

export function parsePublishedSpecVersion(specMarkdown: string): string {
  if (!PUBLISHED_STATUS_PATTERN.test(specMarkdown)) {
    throw new Error("upstream specification.md is missing Status: Published");
  }

  const versionMatch = PUBLISHED_SPEC_VERSION_PATTERN.exec(specMarkdown);
  if (!versionMatch) {
    throw new Error("upstream specification.md is missing Spec Version");
  }

  return versionMatch[1]!;
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const aParts = a.split(".").map((part) => Number(part));
  const bParts = b.split(".").map((part) => Number(part));

  if (aParts.length !== 3 || bParts.length !== 3) {
    throw new Error(`invalid semver: ${a} or ${b}`);
  }

  for (let index = 0; index < 3; index += 1) {
    const aPart = aParts[index]!;
    const bPart = bParts[index]!;

    if (!Number.isInteger(aPart) || !Number.isInteger(bPart)) {
      throw new Error(`invalid semver: ${a} or ${b}`);
    }

    if (aPart < bPart) {
      return -1;
    }
    if (aPart > bPart) {
      return 1;
    }
  }

  return 0;
}

export function confirmPublishedUpstreamVersion(
  signals: PublishedSignalConfirmation,
): string {
  const { markdownVersion, schemaVersion, schemaHttpStatus } = signals;

  if (markdownVersion !== schemaVersion) {
    throw new Error(
      `published signal mismatch: specification.md reports ${markdownVersion} but schema confirmation used ${schemaVersion}`,
    );
  }

  if (schemaHttpStatus !== 200) {
    throw new Error(
      `published schema URL returned HTTP ${schemaHttpStatus} for version ${schemaVersion}`,
    );
  }

  return markdownVersion;
}

export function evaluateSpecRelationship(options: {
  declared: string;
  published: string;
}): SpecRelationshipEvaluation {
  const comparison = compareSemver(options.declared, options.published);

  let relationship: SpecVersionRelationship;
  if (comparison < 0) {
    relationship = "behind";
  } else if (comparison > 0) {
    relationship = "ahead";
  } else {
    relationship = "current";
  }

  return {
    declaredVersion: options.declared,
    latestPublishedVersion: options.published,
    relationship,
    driftDetected: relationship === "behind",
  };
}
