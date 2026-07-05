// Provider-neutral collaborative whiteboard contract.
//
// This is the ONLY surface the UI/hooks talk to. No Canvas / CanvasRenderingContext
// / Excalidraw / tldraw / Fabric / Konva type ever crosses this boundary — swapping
// engines means writing a new adapter that implements `WhiteboardProvider`, with
// zero changes to the hook, the panel, the domain, or the API. Operations are
// plain, resolution-independent data (points normalised to 0..1).

export type WhiteboardTool = "pen" | "eraser" | "pointer";

export type WhiteboardConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export interface Point {
  x: number; // 0..1
  y: number; // 0..1
}

export interface StrokeOperation {
  type: "stroke";
  id: string;
  authorId: string;
  tool: "pen" | "eraser";
  color: string;
  width: number;
  points: Point[];
}

export interface ClearOperation {
  type: "clear";
  id: string;
  authorId: string;
}

export type WhiteboardOperation = StrokeOperation | ClearOperation;

/** Snapshot handed to late joiners; incremental ops are replayed on top. */
export interface WhiteboardSnapshot {
  operations: WhiteboardOperation[];
}

export type WhiteboardErrorCode =
  | "provider_unavailable"
  | "sync_failed"
  | "operation_rejected"
  | "undo_failed"
  | "redo_failed"
  | "clear_failed"
  | "connection_lost"
  | "unknown";

export class WhiteboardError extends Error {
  code: WhiteboardErrorCode;
  constructor(code: WhiteboardErrorCode, message?: string) {
    super(message ?? code);
    this.name = "WhiteboardError";
    this.code = code;
  }
}

/** Provider → app event callbacks. The adapter pushes; it never pulls. */
export interface WhiteboardEvents {
  onConnectionState(state: WhiteboardConnectionState): void;
  onBoardUpdated(): void;
  onOperationReceived(op: WhiteboardOperation): void;
  onBoardCleared(): void;
  onToolChanged(tool: WhiteboardTool): void;
  onError(error: WhiteboardError): void;
}

export interface WhiteboardInitOptions {
  sessionId: string;
  identity: { authorId: string };
  /** The provider owns everything about this element; the UI only supplies it. */
  canvas: HTMLCanvasElement;
  events: WhiteboardEvents;
}

/**
 * The whiteboard port. A real adapter (Excalidraw/tldraw/Fabric/Konva/custom
 * canvas) implements this and lives entirely in infrastructure. ALL canvas
 * manipulation and pointer handling happen inside the provider.
 */
export interface WhiteboardProvider {
  initialize(opts: WhiteboardInitOptions): void;
  destroy(): void;
  clear(): void;
  undo(): void;
  redo(): void;
  setTool(tool: WhiteboardTool): void;
  setColor(color: string): void;
  setStrokeWidth(width: number): void;
  exportState(): WhiteboardSnapshot;
  importState(snapshot: WhiteboardSnapshot): void;
  applyOperation(op: WhiteboardOperation): void;
  connectionState(): WhiteboardConnectionState;
}

export type WhiteboardProviderFactory = () => WhiteboardProvider;
