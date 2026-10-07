#!/usr/bin/env node
import { runRenovateFreshnessPollCli } from "./renovate-freshness-poll.js";

function printRootUsage(): void {
  console.error(`Usage: renovate-workflow <command>

Commands:
  freshness-poll    Run the Renovate post-update babysit helper

Options:
  -h, --help        Show this help

Run \`renovate-workflow freshness-poll --help\` for freshness-poll options.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printRootUsage();
    process.exit(0);
  }

  const [command, ...rest] = args;

  switch (command) {
    case "freshness-poll":
      await runRenovateFreshnessPollCli(rest);
      return;
    default:
      console.error(`unknown command: ${command}`);
      printRootUsage();
      process.exit(2);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
