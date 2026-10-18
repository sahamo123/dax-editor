// The WebSocket side: accepts already-authenticated upgrades, broadcasts WsEvents, drops dead or slow clients.
// Authentication happens in server.ts before handleUpgrade is called; clients can only listen (anything they send is ignored).

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { WsEvent } from "@dax/protocol";
import { WebSocket, WebSocketServer } from "ws";

/** Most simultaneous WebSocket clients; a desktop app needs one or two. */
const MAX_CLIENTS = 16;
/** A client whose unsent data exceeds this many bytes is too slow and is disconnected. */
const MAX_BUFFERED = 32 * 1024 * 1024;
const PING_INTERVAL_MS = 30_000;

/** Broadcasts {@link WsEvent}s to connected clients. */
export class WsHub {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private readonly timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (this.alive.get(ws) === false) {
          ws.terminate();
          continue;
        }
        this.alive.set(ws, false);
        ws.ping();
      }
    }, PING_INTERVAL_MS);
    this.timer.unref();
  }

  /** Number of connected clients. */
  get size(): number {
    return this.wss.clients.size;
  }

  /** Complete an upgrade that server.ts has authenticated. `onOpen` runs once the socket is ready (used to send the first state). */
  upgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    onOpen: (ws: WebSocket) => void,
  ): boolean {
    if (this.wss.clients.size >= MAX_CLIENTS) return false;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.alive.set(ws, true);
      ws.on("pong", () => this.alive.set(ws, true));
      ws.on("error", () => ws.terminate());
      ws.on("message", () => undefined); // server-to-client only
      onOpen(ws);
    });
    return true;
  }

  /** Send one event to every client. */
  broadcast(event: WsEvent): void {
    if (this.wss.clients.size === 0) return;
    this.send(JSON.stringify(event));
  }

  /** Send one event to a single client (for the initial state). */
  sendTo(ws: WebSocket, event: WsEvent): void {
    this.sendRaw(ws, JSON.stringify(event));
  }

  private send(data: string): void {
    for (const ws of this.wss.clients) this.sendRaw(ws, data);
  }

  private sendRaw(ws: WebSocket, data: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED) {
      ws.terminate();
      return;
    }
    ws.send(data);
  }

  /** Close every client with "going away" and stop heartbeats. */
  close(): void {
    clearInterval(this.timer);
    for (const ws of this.wss.clients) ws.close(1001, "server shutting down");
    this.wss.close();
  }
}
