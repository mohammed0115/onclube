// Unit tests for the default canvas adapter (StubWhiteboardProvider). Exercises
// the provider-neutral operation engine directly: draw, remote apply, undo/redo
// (local-only), clear, and late-join snapshot + replay. Drawing is headless
// (jsdom has no 2D context) but the operation log is authoritative.
import { describe, it, expect, beforeEach } from "vitest";
import { StubWhiteboardProvider } from "@/lib/whiteboard";
import {
  _resetBoardCache,
  saveBoardSnapshot,
  loadBoardSnapshot,
  destroyBoard,
} from "@/lib/whiteboard";
import type { WhiteboardEvents, WhiteboardOperation } from "@/lib/whiteboard";

function recorder() {
  const events = {
    states: [] as string[],
    ops: [] as WhiteboardOperation[],
    cleared: 0,
    updated: 0,
    tools: [] as string[],
    onConnectionState: (s) => events.states.push(s),
    onBoardUpdated: () => (events.updated += 1),
    onOperationReceived: (op) => events.ops.push(op),
    onBoardCleared: () => (events.cleared += 1),
    onToolChanged: (t) => events.tools.push(t),
    onError: () => {},
  } as WhiteboardEvents & {
    states: string[];
    ops: WhiteboardOperation[];
    cleared: number;
    updated: number;
    tools: string[];
  };
  return events;
}

function makeProvider(authorId = "me") {
  const provider = new StubWhiteboardProvider();
  const events = recorder();
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  provider.initialize({ sessionId: "s1", identity: { authorId }, canvas, events });
  return { provider, events, canvas };
}

function drawStroke(canvas: HTMLCanvasElement) {
  canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: 40, clientY: 60 }));
  canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: 40, clientY: 60 }));
}

describe("StubWhiteboardProvider — operation engine", () => {
  beforeEach(() => _resetBoardCache());

  it("connects on initialize", () => {
    const { provider, events } = makeProvider();
    expect(provider.connectionState()).toBe("connected");
    expect(events.states).toContain("connected");
  });

  it("draws a line: a pointer gesture produces one stroke operation", () => {
    const { provider, events, canvas } = makeProvider();
    drawStroke(canvas);
    const state = provider.exportState();
    expect(state.operations).toHaveLength(1);
    const op = state.operations[0];
    expect(op.type).toBe("stroke");
    if (op.type === "stroke") {
      expect(op.points.length).toBeGreaterThanOrEqual(2);
      expect(op.authorId).toBe("me");
    }
    expect(events.ops).toHaveLength(1);
  });

  it("receives a remote drawing via applyOperation", () => {
    const { provider, events } = makeProvider();
    const remote: WhiteboardOperation = {
      type: "stroke", id: "r1", authorId: "peer", tool: "pen", color: "#f00", width: 3,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    };
    provider.applyOperation(remote);
    expect(provider.exportState().operations).toContainEqual(remote);
    expect(events.ops[events.ops.length - 1]).toEqual(remote);
  });

  it("undo removes only the local author's latest operation", () => {
    const { provider, canvas } = makeProvider("me");
    // A remote peer's stroke plus a local stroke.
    provider.applyOperation({ type: "stroke", id: "peer-1", authorId: "peer", tool: "pen", color: "#000", width: 2, points: [{ x: 0.3, y: 0.3 }] });
    drawStroke(canvas);
    expect(provider.exportState().operations).toHaveLength(2);

    provider.undo();
    const remaining = provider.exportState().operations;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].authorId).toBe("peer"); // remote survives; only local undone
  });

  it("redo restores the local author's undone operation", () => {
    const { provider, canvas } = makeProvider();
    drawStroke(canvas);
    provider.undo();
    expect(provider.exportState().operations).toHaveLength(0);
    provider.redo();
    expect(provider.exportState().operations).toHaveLength(1);
  });

  it("clear board appends a clear op and emits onBoardCleared", () => {
    const { provider, events, canvas } = makeProvider();
    drawStroke(canvas);
    provider.clear();
    expect(events.cleared).toBe(1);
    const ops = provider.exportState().operations;
    expect(ops[ops.length - 1].type).toBe("clear");
  });

  it("late join: importState replays a snapshot, then live ops append", () => {
    // Board A produces state.
    const a = makeProvider("a");
    a.canvas && drawStroke(a.canvas);
    const snapshot = a.provider.exportState();
    expect(snapshot.operations.length).toBe(1);

    // Board B joins late and receives the snapshot, then a live op.
    const b = makeProvider("b");
    b.provider.importState(snapshot);
    expect(b.provider.exportState().operations).toHaveLength(1);
    b.provider.applyOperation({ type: "stroke", id: "live-1", authorId: "a", tool: "pen", color: "#000", width: 2, points: [{ x: 0.5, y: 0.5 }] });
    expect(b.provider.exportState().operations).toHaveLength(2);
  });

  it("board cache preserves on leave and destroys on end", () => {
    const snap = { operations: [{ type: "clear", id: "c1", authorId: "me" }] as WhiteboardOperation[] };
    saveBoardSnapshot("s-keep", snap); // leaving preserves
    expect(loadBoardSnapshot("s-keep")).toEqual(snap);
    destroyBoard("s-keep"); // ending destroys
    expect(loadBoardSnapshot("s-keep")).toBeNull();
  });
});
