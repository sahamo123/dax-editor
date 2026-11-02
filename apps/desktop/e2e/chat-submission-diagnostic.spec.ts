// Investigate intermittent synthetic chat submission without logging the engine URL, token or user media.

import type { WebSocket } from "@playwright/test";
import { chatInput, expect, test } from "./fixtures";

test.skip(process.env.DAX_CHAT_DIAGNOSTIC !== "1", "Opt-in diagnostic for issue #186");

test("control browser fill in a plain textarea", async ({ page }) => {
  await page.setContent('<label>Control<textarea aria-label="Control"></textarea></label>');
  const input = page.getByLabel("Control");
  await input.fill("Add a title");
  await expect(input).toHaveValue("Add a title");
  await input.press("Enter");
  await expect(input).toHaveValue("Add a title\n");
});

test("control browser typing in an autosizing textarea", async ({ page }) => {
  await page.setContent(`<style>textarea { min-height: 72px; max-height: 140px; line-height: 1.4; }</style>
    <textarea aria-label="Autosize" rows="1"></textarea>
    <script>document.querySelector('textarea').addEventListener('input', (e) => {
      e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
    });</script>`);
  const input = page.getByLabel("Autosize");
  await input.pressSequentially("Add a title");
  await expect(input).toHaveValue("Add a title");
});

test("control chat submission with an empty project", async ({ page, startServer, openApp }) => {
  const server = await startServer({ aiReady: true });
  await openApp(server);
  const input = chatInput(page);
  try {
    await input.pressSequentially("Add a title");
    expect(await input.inputValue()).toBe("Add a title");
    await input.press("Enter");
    await expect(page.getByRole("log").getByText("Add a title")).toBeVisible();
  } catch (error) {
    console.log(
      JSON.stringify({
        disconnected: await page.getByText("Can't reach the editor engine.").isVisible(),
        draftLength: (await input.inputValue()).length,
        inputDisabled: await input.isDisabled(),
      }),
    );
    throw error;
  }
});

test("diagnose intermittent chat submission", async ({
  page,
  startServer,
  openApp,
  sampleVideo,
}) => {
  const events: string[] = [];
  const sockets: WebSocket[] = [];
  page.on("websocket", (socket) => {
    sockets.push(socket);
    events.push("socket created");
    socket.on("close", () => events.push("socket closed"));
    socket.on("socketerror", () => events.push("socket error"));
  });
  page.on("requestfailed", (request) => {
    events.push(
      `request failed: ${request.resourceType()} ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  await page.addInitScript(() => {
    let lastInputTarget: EventTarget | null = null;
    let lastComposer: Element | null = null;
    const keyEvents: Array<Record<string, boolean | string>> = [];
    (window as Window & { __daxChatDiagnostic?: typeof keyEvents }).__daxChatDiagnostic = keyEvents;
    const originalFocus = HTMLElement.prototype.focus;
    const originalBlur = HTMLElement.prototype.blur;
    HTMLElement.prototype.focus = function (options) {
      keyEvents.push({
        event: "focus-call",
        composer:
          this instanceof HTMLTextAreaElement &&
          this.getAttribute("aria-label") === "Message to the assistant",
      });
      originalFocus.call(this, options);
    };
    HTMLElement.prototype.blur = function () {
      keyEvents.push({
        event: "blur-call",
        composer:
          this instanceof HTMLTextAreaElement &&
          this.getAttribute("aria-label") === "Message to the assistant",
      });
      originalBlur.call(this);
    };
    window.addEventListener("blur", () => keyEvents.push({ event: "window-blur" }));
    window.addEventListener("focus", () => keyEvents.push({ event: "window-focus" }));
    document.addEventListener("visibilitychange", () =>
      keyEvents.push({ event: "visibility", state: document.visibilityState }),
    );
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (
          target instanceof HTMLTextAreaElement &&
          target.getAttribute("aria-label") === "Message to the assistant"
        ) {
          keyEvents.push({
            event: "disabled-change",
            disabled: target.disabled,
            wasDisabled: record.oldValue !== null,
          });
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["disabled"],
    });
    new MutationObserver((records) => {
      if (!lastComposer) return;
      for (const record of records) {
        for (const removed of record.removedNodes) {
          if (removed === lastComposer || removed.contains(lastComposer)) {
            keyEvents.push({ event: "composer-removed" });
          }
        }
      }
    }).observe(document, { subtree: true, childList: true });
    new MutationObserver((records) => {
      if (!lastComposer) return;
      for (const record of records) {
        const target = record.target;
        if (
          target instanceof Element &&
          (target === lastComposer || target.contains(lastComposer))
        ) {
          keyEvents.push({
            event: "ancestor-attribute",
            attribute: record.attributeName ?? "unknown",
            composer: target === lastComposer,
          });
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "inert", "style", "class"],
    });
    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target;
        if (
          target instanceof HTMLTextAreaElement &&
          target.getAttribute("aria-label") === "Message to the assistant"
        )
          lastComposer = target;
        keyEvents.push({
          event: "focus",
          composer:
            target instanceof HTMLTextAreaElement &&
            target.getAttribute("aria-label") === "Message to the assistant",
        });
      },
      true,
    );
    document.addEventListener(
      "input",
      (event) => {
        if (event.target instanceof HTMLTextAreaElement) lastInputTarget = event.target;
      },
      true,
    );
    document.addEventListener(
      "focusout",
      (event) => {
        const target = event.target;
        let cssHidden = false;
        for (
          let node = target instanceof Element ? target : null;
          node;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") cssHidden = true;
        }
        keyEvents.push({
          event: "blur",
          composer:
            target instanceof HTMLTextAreaElement &&
            target.getAttribute("aria-label") === "Message to the assistant",
          disabled: target instanceof HTMLTextAreaElement && target.disabled,
          relatedElement: event.relatedTarget instanceof Element,
          hiddenAncestor: target instanceof Element && target.closest("[hidden]") !== null,
          connected: target instanceof Element && target.isConnected,
          inertAncestor: target instanceof Element && target.closest("[inert]") !== null,
          cssHidden,
        });
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter") return;
        const target = event.target;
        const textAtKey = target instanceof HTMLTextAreaElement && target.value.trim().length > 0;
        keyEvents.push({
          event: "enter",
          composer:
            target instanceof HTMLTextAreaElement &&
            target.getAttribute("aria-label") === "Message to the assistant",
          inputObserved: lastInputTarget !== null,
          inputConnected: lastInputTarget instanceof Element && lastInputTarget.isConnected,
          sameTarget: target === lastInputTarget,
          textAtKey,
          composing: event.isComposing,
          shift: event.shiftKey,
        });
      },
      true,
    );
  });

  const server = await startServer({ aiReady: true });
  await server.importPaths([sampleVideo]);
  await server.command("split", { at: 2 });
  await openApp(server);
  const inputBefore = await chatInput(page).elementHandle();

  try {
    if (process.env.DAX_CHAT_DIAGNOSTIC_INPUT === "keys") {
      await chatInput(page).pressSequentially("Add a title");
    } else {
      await chatInput(page).fill("Add a title");
    }
    if ((await chatInput(page).inputValue()) !== "Add a title") {
      throw new Error("The test input action returned without the expected composer text.");
    }
    await chatInput(page).press("Enter");
    await expect(page.getByRole("button", { name: "Undo this change" })).toBeVisible();
  } catch (error) {
    // Check server reachability independently without exposing credentials or project contents.
    let reachable = false;
    let overlayCount: number | null = null;
    try {
      const state = await server.api.state();
      reachable = true;
      overlayCount = state.project.timeline.overlays.length;
    } catch {
      // The connection and server health are reported separately.
    }
    const disconnected = await page.getByText("Can't reach the editor engine.").isVisible();
    const promptShown = await page.getByRole("log").getByText("Add a title").isVisible();
    const responseShown = await page
      .getByRole("log")
      .getByText("I added a title at the start.")
      .isVisible();
    const draftPresent = (await chatInput(page).inputValue()) === "Add a title";
    const inputDisabled = await chatInput(page).isDisabled();
    const sendDisabled = await page.getByRole("button", { name: "Send message" }).isDisabled();
    const originalInputConnected = await inputBefore?.evaluate((node) => node.isConnected);
    const keyEvents = await page.evaluate(
      () => (window as Window & { __daxChatDiagnostic?: unknown }).__daxChatDiagnostic,
    );
    console.log(
      JSON.stringify({
        events,
        keyEvents,
        socketClosed: sockets.map((socket) => socket.isClosed()),
        serverReachable: reachable,
        disconnected,
        promptShown,
        responseShown,
        overlayCount,
        draftPresent,
        inputDisabled,
        sendDisabled,
        originalInputConnected,
      }),
    );
    throw error;
  }
});
