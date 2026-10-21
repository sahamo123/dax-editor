// Steering continues the same conversation at safe boundaries without cancelling completed/in-flight work.
import { emptyProject, Session } from "@dax/core";
import { describe, expect, it } from "vitest";
import { createAgent } from "./agent.js";
import { ScriptedProvider } from "./scripted.js";

describe("cooperative steering", () => {
  it("finishes the current tool call then uses guidance in the next model turn", async () => {
    const session = new Session(emptyProject("steering"));
    const pending: string[] = [];
    const controller = new AbortController();
    const provider = new ScriptedProvider([
      () => {
        pending.push("Keep the new format and add a concise summary");
        return {
          toolCalls: [{ id: "format", name: "set_format", arguments: { preset: "square-1080" } }],
        };
      },
      (request) => {
        expect(request.messages.at(-1)).toMatchObject({
          role: "user",
          content: expect.stringContaining("Keep the new format"),
        });
        expect(session.project.timeline.width).toBe(1080);
        return { text: "Continued." };
      },
    ]);
    const result = await createAgent({ provider }).run("Set the format", {
      session,
      signal: controller.signal,
      takeSteering: () => pending.splice(0),
    });
    expect(result.error).toBeUndefined();
    expect(result.stopReason).toBe("done");
    expect(controller.signal.aborted).toBe(false);
    expect(result.turns).toBe(2);
  });
  it("continues when guidance arrives while the model is finishing a text reply", async () => {
    const pending: string[] = [];
    const provider = new ScriptedProvider([
      () => {
        pending.push("Also include the next step");
        return { text: "First answer." };
      },
      (request) => {
        expect(request.messages.at(-1)).toMatchObject({
          role: "user",
          content: expect.stringContaining("next step"),
        });
        return { text: "Next step." };
      },
    ]);
    const result = await createAgent({ provider }).run("Make a plan", {
      session: new Session(emptyProject("steering")),
      takeSteering: () => pending.splice(0),
    });
    expect(result.text).toBe("Next step.");
    expect(result.turns).toBe(2);
  });
});
