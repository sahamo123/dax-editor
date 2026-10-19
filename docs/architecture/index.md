# Architecture

## Documents

* [CLI and MCP server](cli-and-mcp.md) - How the dax command line and the MCP server reach the command registry in-process, share project files, and how the MCP server's tools, resources, transports and security map onto core.
* [CLI bridges](cli-bridges.md) - How dax-editor drives the user's own installed and signed-in command-line agents (Claude Code first, Codex detection only) as chat backends, with dax's MCP tools exposed to them, and what the bridge never touches.
* [Architecture overview](overview.md) - How the command registry, engine, shared protocol, server, agent and desktop app fit together, the invariants that must hold, and the extension points.
