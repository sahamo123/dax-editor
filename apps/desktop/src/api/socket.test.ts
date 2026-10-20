// The live socket: URL building, message parsing, and automatic reconnect with backoff (with a fake WebSocket).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeState } from "../app/test-utils";
import { openLiveSocket, parseWsEvent, type SocketStatus, socketUrl } from "./socket";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

const Impl = FakeSocket as unknown as typeof WebSocket;

describe("socketUrl", () => {
  it("swaps the scheme and puts the token in the query", () => {
    expect(socketUrl("http://127.0.0.1:4000", "a b")).toBe("ws://127.0.0.1:4000/ws?token=a+b");
    expect(socketUrl("https://h.example", "t")).toBe("wss://h.example/ws?token=t");
  });
});

describe("parseWsEvent", () => {
  it("accepts known events and rejects everything else", () => {
    expect(parseWsEvent(JSON.stringify({ type: "state", state: makeState() }))?.type).toBe("state");
    expect(
      parseWsEvent(JSON.stringify({ type: "chat", runId: "r", event: { type: "text", text: "x" } }))
        ?.type,
    ).toBe("chat");
    expect(parseWsEvent(JSON.stringify({ type: "job", job: { id: "j" } }))?.type).toBe("job");
    expect(parseWsEvent(JSON.stringify({ type: "state", state: { nope: true } }))).toBeNull();
    expect(parseWsEvent("not json")).toBeNull();
    expect(parseWsEvent(new ArrayBuffer(1))).toBeNull();
    expect(parseWsEvent(JSON.stringify({ type: "mystery" }))).toBeNull();
  });
});

describe("openLiveSocket", () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  function open() {
    const statuses: [SocketStatus, number][] = [];
    const events: unknown[] = [];
    const live = openLiveSocket({
      baseUrl: "http://127.0.0.1:1",
      token: "t",
      WebSocketImpl: Impl,
      baseDelayMs: 100,
      maxDelayMs: 400,
      onEvent: (e) => events.push(e),
      onStatus: (s, info) => statuses.push([s, info.failures]),
    });
    return { live, statuses, events };
  }

  it("reports open, delivers events, and reconnects after a drop with growing delays", () => {
    const { statuses, events } = open();
    const first = FakeSocket.instances[0];
    first?.onopen?.();
    first?.onmessage?.({
      data: JSON.stringify({ type: "chat", runId: "r", event: { type: "status", text: "hi" } }),
    });
    expect(events).toHaveLength(1);

    first?.onclose?.();
    expect(statuses.at(-1)).toEqual(["closed", 1]);
    vi.advanceTimersByTime(99);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    // Second consecutive failure waits twice as long; the third is capped.
    FakeSocket.instances[1]?.onclose?.();
    vi.advanceTimersByTime(199);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);
    FakeSocket.instances[2]?.onclose?.();
    vi.advanceTimersByTime(400);
    expect(FakeSocket.instances).toHaveLength(4);
    FakeSocket.instances[3]?.onclose?.();
    vi.advanceTimersByTime(399);
    expect(FakeSocket.instances).toHaveLength(4);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(5);
  });

  it("resets the failure count once connected", () => {
    const { statuses } = open();
    FakeSocket.instances[0]?.onclose?.();
    vi.advanceTimersByTime(100);
    FakeSocket.instances[1]?.onopen?.();
    expect(statuses.at(-1)).toEqual(["open", 0]);
  });

  it("retryNow reconnects immediately", () => {
    const { live } = open();
    FakeSocket.instances[0]?.onclose?.();
    live.retryNow();
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("close stops everything for good", () => {
    const { live } = open();
    const first = FakeSocket.instances[0];
    live.close();
    expect(first?.closed).toBe(true);
    first?.onclose?.();
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
