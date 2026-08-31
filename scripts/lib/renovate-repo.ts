import { execSync } from "node:child_process";

export type RepoIdentity = {
  owner: string;
  name: string;
  fullName: string;
};

const REMOTE_PATTERN =
  /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:)([^/]+)\/([^/.]+)(?:\.git)?$/;

export function parseGitHubRemote(url: string): RepoIdentity | null {
  const match = url.trim().match(REMOTE_PATTERN);
  if (!match) {
    return null;
  }
  const owner = match[1];
  const name = match[2];
  return { owner, name, fullName: `${owner}/${name}` };
}

export function resolveRepoIdentity(options?: {
  cwd?: string;
  remote?: string;
  owner?: string;
  name?: string;
}): RepoIdentity {
  if (options?.owner && options?.name) {
    return {
      owner: options.owner,
      name: options.name,
      fullName: `${options.owner}/${options.name}`,
    };
  }

  const remote =
    options?.remote ??
    execSync("git remote get-url origin", {
      cwd: options?.cwd ?? process.cwd(),
      encoding: "utf8",
    }).trim();

  const parsed = parseGitHubRemote(remote);
  if (!parsed) {
    throw new Error(`Could not parse GitHub owner/repo from remote: ${remote}`);
  }
  return parsed;
}

export type DeploymentMode = "pat_branch" | "github_app";

export function describeDeploymentMode(mode: DeploymentMode): string {
  switch (mode) {
    case "pat_branch":
      return "Personal Access Token with Renovate branches under renovate/ prefix";
    case "github_app":
      return "GitHub App installation with per-run tokens";
  }
}
