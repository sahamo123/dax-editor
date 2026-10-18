// Public surface of @dax/cli: run the command line in-process, with replaceable input and output.

export { CliError, type CliIo, EXIT, type ExitCode, processIo } from "./io.js";
export { runCli } from "./main.js";
export { DEFAULT_PROJECT_FILE, resolveProjectFile } from "./project.js";
export { findServer, type ServerCommand } from "./serve.js";
export { CLI_VERSION } from "./version.js";
