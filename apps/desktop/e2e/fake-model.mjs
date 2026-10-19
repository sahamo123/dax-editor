// A stand-in for an OpenAI-compatible model server, on 127.0.0.1, so the REAL agent can be driven end to end without
// a network or a paid key. It answers the first request of a conversation with one tool call (add a title) and the
// next one, which carries the tool's result, with a closing sentence. It answers the way the request asks:
// Server-Sent Events when the body says `stream: true`, one JSON document otherwise.

import { createServer } from "node:http";

/** The tool call the "model" decides to make on its first turn. */
const TOOL_CALL = {
  id: "call_1",
  name: "add_overlay",
  arguments: JSON.stringify({ preset: "title-fade", start: 0, text: "From the model" }),
};
/** What it says once it has seen the tool's result. */
const CLOSING = "I added the title you asked for.";

/** One Server-Sent Event for the OpenAI streaming format. */
const event = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

/** The reply to `body` as `{ type, text }`, ready to send. */
function reply(body) {
  const sawToolResult = (body.messages ?? []).some((m) => m.role === "tool");
  if (body.stream) {
    const chunks = sawToolResult
      ? [
          event({ choices: [{ delta: { content: CLOSING } }] }),
          event({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        ]
      : [
          event({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: TOOL_CALL.id,
                      function: { name: TOOL_CALL.name, arguments: TOOL_CALL.arguments },
                    },
                  ],
                },
              },
            ],
          }),
          event({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
        ];
    return { type: "text/event-stream", text: `${chunks.join("")}data: [DONE]\n\n` };
  }
  const message = sawToolResult
    ? { role: "assistant", content: CLOSING }
    : {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: TOOL_CALL.id,
            type: "function",
            function: { name: TOOL_CALL.name, arguments: TOOL_CALL.arguments },
          },
        ],
      };
  return {
    type: "application/json",
    text: JSON.stringify({
      choices: [{ message, finish_reason: sawToolResult ? "stop" : "tool_calls" }],
    }),
  };
}

/**
 * Start the fake model. Resolves to `{ baseUrl, requests, close }`: `baseUrl` is what goes in the app's
 * "Base URL" setting (it ends in `/v1`), `requests` lists `{ authorization, body }` for every call received.
 */
export async function startFakeModel() {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        // leave empty: the reply below is still well formed
      }
      requests.push({ authorization: req.headers.authorization, body });
      const r = reply(body);
      res.writeHead(200, { "content-type": r.type });
      res.end(r.text);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
