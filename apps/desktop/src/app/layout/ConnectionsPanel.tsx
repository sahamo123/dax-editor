// Local client setup contains launch arguments only; tokens remain in private discovery storage.
import { type ReactElement, useEffect } from "react";
import { useApp, useController } from "../context";

/** Configure Claude/Codex MCP against this running editor, including read-only Planning. */
export function ConnectionsPanel(): ReactElement {
  const controller = useController();
  const mcp = useApp((s) => s.state?.mcp);
  useEffect(() => {
    const timer = setInterval(() => void controller.refreshState(), 5000);
    return () => clearInterval(timer);
  }, [controller]);
  if (!mcp?.enabled)
    return (
      <p className="project-tools muted">Live editor MCP is unavailable in this engine build.</p>
    );
  const snippets = [
    {
      label: "Claude Desktop / Claude Code",
      text: JSON.stringify(
        {
          mcpServers: {
            dax_editor: { command: mcp.command, args: mcp.args },
            dax_planning: { command: mcp.command, args: mcp.planArgs },
          },
        },
        null,
        2,
      ),
    },
    {
      label: "Codex",
      text: `[mcp_servers.dax_editor]
command = ${JSON.stringify(mcp.command)}
args = ${JSON.stringify(mcp.args)}

[mcp_servers.dax_planning]
command = ${JSON.stringify(mcp.command)}
args = ${JSON.stringify(mcp.planArgs)}`,
    },
  ];
  return (
    <div className="project-tools stack">
      <h3>Connect an assistant</h3>
      <p role="status">{mcp.clients} connected MCP session(s)</p>
      <p className="muted">
        Keep the editor open. Your assistant edits this same project and shared history.
      </p>
      <p className="muted">
        Use dax_planning to inspect without changes. Start edits with get_project; use
        apply_edit_batch for one undo step. Background work appears in Tasks.
      </p>
      {snippets.map((snippet) => (
        <section className="stack" key={snippet.label}>
          <h4>{snippet.label}</h4>
          <textarea
            className="input input--mono"
            rows={9}
            readOnly
            aria-label={`${snippet.label} MCP configuration`}
            value={snippet.text}
          />
          <button
            className="btn"
            type="button"
            onClick={() => void navigator.clipboard?.writeText(snippet.text)}
          >
            Copy configuration
          </button>
        </section>
      ))}
      <small className="muted">
        Add the matching configuration in your client's MCP settings, then reconnect. These snippets
        contain no API key or runtime token.
      </small>
    </div>
  );
}
