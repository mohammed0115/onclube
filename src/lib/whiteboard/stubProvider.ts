// Stub whiteboard provider — a genuine Canvas 2D adapter (the default "custom
// canvas" engine). It owns ALL canvas + pointer logic and keeps a provider-neutral
// operation log so late joiners can be replayed. It performs NO real network sync
// (single-peer); a real transport-backed adapter implements the same port and
// fans operations out to peers with zero UI changes. Drawing degrades gracefully
// when no 2D context is available (e.g. jsdom): the operation log still works.
import type {
  Point,
  StrokeOperation,
  WhiteboardConnectionState,
  WhiteboardEvents,
  WhiteboardInitOptions,
  WhiteboardOperation,
  WhiteboardProvider,
  WhiteboardSnapshot,
  WhiteboardTool,
} from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function newOpId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `op-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export class StubWhiteboardProvider implements WhiteboardProvider {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private events: WhiteboardEvents | null = null;
  private authorId = "";
  private state: WhiteboardConnectionState = "idle";

  private ops: WhiteboardOperation[] = [];
  private redoStack: WhiteboardOperation[] = [];

  private tool: WhiteboardTool = "pen";
  private color = "#111827";
  private width = 4;

  private drawing = false;
  private current: Point[] = [];

  initialize(opts: WhiteboardInitOptions): void {
    this.canvas = opts.canvas;
    this.events = opts.events;
    this.authorId = opts.identity.authorId;
    try {
      // Headless environments (jsdom) may lack a 2D context — degrade to the
      // operation log only; drawing is a no-op but state stays authoritative.
      this.ctx = typeof this.canvas.getContext === "function" ? this.canvas.getContext("2d") : null;
    } catch {
      this.ctx = null;
    }
    this.bind();
    this.setState("connecting");
    this.setState("connected");
    this.repaint();
  }

  private bind(): void {
    const c = this.canvas;
    if (!c) return;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointerleave", this.onUp);
  }

  private unbind(): void {
    const c = this.canvas;
    if (!c) return;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointerleave", this.onUp);
  }

  private toPoint(e: { clientX: number; clientY: number }): Point {
    const c = this.canvas!;
    const r = c.getBoundingClientRect();
    const w = r.width || c.width || 1;
    const h = r.height || c.height || 1;
    return { x: clamp01((e.clientX - r.left) / w), y: clamp01((e.clientY - r.top) / h) };
  }

  private onDown = (e: PointerEvent) => {
    if (this.tool === "pointer") return; // pointer tool does not draw
    this.drawing = true;
    this.current = [this.toPoint(e)];
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drawing) return;
    this.current.push(this.toPoint(e));
    this.repaint();
  };

  private onUp = () => {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.current.length === 0) return;
    const op: StrokeOperation = {
      type: "stroke",
      id: newOpId(),
      authorId: this.authorId,
      tool: this.tool === "eraser" ? "eraser" : "pen",
      color: this.color,
      width: this.width,
      points: this.current,
    };
    this.ops.push(op);
    this.redoStack = [];
    this.current = [];
    this.repaint();
    this.events?.onOperationReceived(op);
    this.events?.onBoardUpdated();
  };

  applyOperation(op: WhiteboardOperation): void {
    // Remote operation from a peer — append and repaint. (No echo emit.)
    this.ops.push(op);
    this.repaint();
    this.events?.onOperationReceived(op);
    this.events?.onBoardUpdated();
  }

  clear(): void {
    const op: WhiteboardOperation = { type: "clear", id: newOpId(), authorId: this.authorId };
    this.ops.push(op);
    this.redoStack = [];
    this.repaint();
    this.events?.onBoardCleared();
    this.events?.onBoardUpdated();
  }

  undo(): void {
    // Only the local author's latest operation.
    for (let i = this.ops.length - 1; i >= 0; i--) {
      if (this.ops[i].authorId === this.authorId) {
        const [removed] = this.ops.splice(i, 1);
        this.redoStack.push(removed);
        this.repaint();
        this.events?.onBoardUpdated();
        return;
      }
    }
  }

  redo(): void {
    // Only the local author's history.
    const op = this.redoStack.pop();
    if (!op) return;
    this.ops.push(op);
    this.repaint();
    this.events?.onBoardUpdated();
  }

  setTool(tool: WhiteboardTool): void {
    this.tool = tool;
    this.events?.onToolChanged(tool);
  }

  setColor(color: string): void {
    this.color = color;
  }

  setStrokeWidth(width: number): void {
    this.width = width;
  }

  exportState(): WhiteboardSnapshot {
    return { operations: this.ops.map((o) => ({ ...o })) };
  }

  importState(snapshot: WhiteboardSnapshot): void {
    this.ops = snapshot.operations.map((o) => ({ ...o }));
    this.redoStack = [];
    this.repaint();
    this.events?.onBoardUpdated();
  }

  connectionState(): WhiteboardConnectionState {
    return this.state;
  }

  destroy(): void {
    this.unbind();
    this.setState("disconnected");
    this.events = null;
    this.canvas = null;
    this.ctx = null;
  }

  private setState(state: WhiteboardConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }

  private repaint(): void {
    const ctx = this.ctx;
    const c = this.canvas;
    if (!ctx || !c) return; // headless (jsdom): op-log still authoritative
    ctx.clearRect(0, 0, c.width, c.height);
    const draw = (op: WhiteboardOperation) => {
      if (op.type === "clear") {
        ctx.clearRect(0, 0, c.width, c.height);
        return;
      }
      ctx.strokeStyle = op.tool === "eraser" ? "#ffffff" : op.color;
      ctx.lineWidth = op.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      op.points.forEach((p, i) => {
        const x = p.x * c.width;
        const y = p.y * c.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    const previewing = this.drawing && this.current.length > 0;
    for (const op of this.ops) draw(op);
    if (previewing) {
      draw({
        type: "stroke",
        id: "preview",
        authorId: this.authorId,
        tool: this.tool === "eraser" ? "eraser" : "pen",
        color: this.color,
        width: this.width,
        points: this.current,
      });
    }
  }
}

export const createStubWhiteboardProvider = (): WhiteboardProvider => new StubWhiteboardProvider();
