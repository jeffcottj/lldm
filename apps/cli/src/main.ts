#!/usr/bin/env node

import { RUNTIME_VERSION } from "@lldm/runtime";

const CLI_VERSION = "0.0.0";
const HELP = `LLDM deterministic runtime CLI

Usage: lldm [--help] [--version]

Options:
  --help       Show this help.
  --version    Show the CLI and runtime versions.

Persistence and game commands are not implemented yet. Room, phone, TV,
provider, and generated-media features remain outside the Phase 1 CLI.`;

const argumentsWithoutSeparator = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");

if (
  argumentsWithoutSeparator.length === 0 ||
  argumentsWithoutSeparator.includes("--help") ||
  argumentsWithoutSeparator.includes("-h")
) {
  console.log(HELP);
} else if (
  argumentsWithoutSeparator.length === 1 &&
  (argumentsWithoutSeparator[0] === "--version" ||
    argumentsWithoutSeparator[0] === "-v")
) {
  console.log(`lldm ${CLI_VERSION} (runtime ${RUNTIME_VERSION})`);
} else {
  console.error(
    `Command not implemented: ${argumentsWithoutSeparator.join(" ")}\nRun lldm --help for the current boundary.`,
  );
  process.exitCode = 2;
}
