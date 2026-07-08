// Production whiteboard provider — WebSocket sync (transport-only, Sprint 10).
//
// Implements the UNCHANGED WhiteboardProvider port. The canvas engine stays the
// local (stub) engine; this adapter adds real-time SYNC: local operations are
// broadcast over a WebSocket and remote operations are applied. If the socket is
// unavailable the board still works locally (never crashes).
import { WsClient, type SocketFactory } from "@/lib/net/wsClient";
import { StubWhiteboardProvider } from "./stubProvider";
import type {
  WhiteboardConnectionState,
  WhiteboardEvents,
  WhiteboardInitOptions,
  WhiteboardOperation,
  WhiteboardProvider,
  WhiteboardSnapshot,
  WhiteboardTool,
} from "./types";

export class WebSocketWhiteboardProvider implements WhiteboardProvider {
  private impl = new StubWhiteboardProvider();
  private ws: WsClient | null = null;

  constructor(private baseUrl: string, private socketFactory?: SocketFactory) {}

  initialize(opts: WhiteboardInitOptions): void {
    // Intercept locally-produced operations and broadcast them.
    const events: WhiteboardEvents = {
      ...opts.events,
      onOperationReceived: (op) => {
        opts.events.onOperationReceived(op);
        this.ws?.sendJson({ type: "op", op });
      },
      onBoardCleared: () => {
        opts.events.onBoardCleared();
        this.ws?.sendJson({ type: "clear" });
      },
    };
    this.impl.initialize({ ...opts, events });
    this.ws = new WsClient({
      url: `${this.baseUrl}?session=${encodeURIComponent(opts.sessionId)}`,
      socketFactory: this.socketFactory,
      onState: () => {},
      onMessage: (d) => this.handle(d),
    });
    this.ws.connect();
  }

  private handle(d: unknown): void {
    const f = d as { type?: string; op?: WhiteboardOperation; snapshot?: WhiteboardSnapshot };
    if (f?.type === "op" && f.op) this.impl.applyOperation(f.op);
    else if (f?.type === "clear") this.impl.clear();
    else if (f?.type === "snapshot" && f.snapshot) this.impl.importState(f.snapshot);
  }

  destroy(): void {
    this.ws?.close();
    this.ws = null;
    this.impl.destroy();
  }
  clear(): void {
    this.impl.clear();
  }
  undo(): void {
    this.impl.undo();
  }
  redo(): void {
    this.impl.redo();
  }
  setTool(tool: WhiteboardTool): void {
    this.impl.setTool(tool);
  }
  setColor(color: string): void {
    this.impl.setColor(color);
  }
  setStrokeWidth(width: number): void {
    this.impl.setStrokeWidth(width);
  }
  exportState(): WhiteboardSnapshot {
    return this.impl.exportState();
  }
  importState(snapshot: WhiteboardSnapshot): void {
    this.impl.importState(snapshot);
  }
  applyOperation(op: WhiteboardOperation): void {
    this.impl.applyOperation(op);
  }
  connectionState(): WhiteboardConnectionState {
    return this.impl.connectionState();
  }
}
