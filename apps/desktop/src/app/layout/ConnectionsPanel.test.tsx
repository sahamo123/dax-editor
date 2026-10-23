// Copied client configuration must contain actual TOML lines and preserve Windows path escaping.
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { makeState, renderApp } from "../test-utils";
import { ConnectionsPanel } from "./ConnectionsPanel";

it("offers multiline Codex configuration with separate read-only launch arguments", () => {
  const command = "C:\\Dax Editor\\node.exe";
  const args = ["C:\\Dax Editor\\editor-proxy.mjs", "--data-dir", "C:\\Dax Data"];
  renderApp(<ConnectionsPanel />, (store) =>
    store.applyState(
      makeState({
        mcp: { enabled: true, clients: 0, command, args, planArgs: [...args, "--plan"] },
      }),
    ),
  );
  const text = screen.getByLabelText<HTMLTextAreaElement>("Codex MCP configuration").value;
  const lines = text.split("\n");
  expect(lines).toHaveLength(7);
  expect(lines[0]).toBe("[mcp_servers.dax_editor]");
  expect(lines[4]).toBe("[mcp_servers.dax_planning]");
  expect(JSON.parse(lines[1]?.slice("command = ".length) ?? "null")).toBe(command);
  expect(JSON.parse(lines[2]?.slice("args = ".length) ?? "null")).toEqual(args);
  expect(JSON.parse(lines[6]?.slice("args = ".length) ?? "null")).toEqual([...args, "--plan"]);
});
