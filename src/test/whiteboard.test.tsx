import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionWhiteboard } from "@/components/session/SessionWhiteboard";
import {
  WhiteboardProviderContext,
  WhiteboardError,
  _resetBoardCache,
  saveBoardSnapshot,
  loadBoardSnapshot,
} from "@/lib/whiteboard";
import type {
  WhiteboardErrorCode,
  WhiteboardEvents,
  WhiteboardInitOptions,
  WhiteboardOperation,
  WhiteboardProvider,
  WhiteboardSnapshot,
  WhiteboardTool,
} from "@/lib/whiteboard";

// Fully controllable fake — the UI must drive the board purely through this port.
class FakeWhiteboardProvider implements WhiteboardProvider {
  calls: string[] = [];
  autoConnect = true;
  failInit: WhiteboardErrorCode | null = null;
  ops: WhiteboardOperation[] = [];
  private events: WhiteboardEvents | null = null;

  initialize(o: WhiteboardInitOptions): void {
    this.calls.push("initialize");
    this.events = o.events;
    if (this.failInit) throw new WhiteboardError(this.failInit);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) o.events.onConnectionState("connected");
  }
  destroy(): void {
    this.calls.push("destroy");
  }
  clear(): void {
    this.calls.push("clear");
    this.events?.onBoardCleared();
  }
  undo(): void {
    this.calls.push("undo");
  }
  redo(): void {
    this.calls.push("redo");
  }
  setTool(t: WhiteboardTool): void {
    this.calls.push(`setTool:${t}`);
    this.events?.onToolChanged(t);
  }
  setColor(c: string): void {
    this.calls.push(`setColor:${c}`);
  }
  setStrokeWidth(w: number): void {
    this.calls.push(`setStrokeWidth:${w}`);
  }
  exportState(): WhiteboardSnapshot {
    return { operations: this.ops };
  }
  importState(s: WhiteboardSnapshot): void {
    this.calls.push("importState");
    this.ops = s.operations;
  }
  applyOperation(op: WhiteboardOperation): void {
    this.calls.push("applyOperation");
    this.events?.onOperationReceived(op);
  }
  connectionState() {
    return "connected" as const;
  }
  // drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  emitError(code: WhiteboardErrorCode) {
    this.events?.onError(new WhiteboardError(code));
  }
}

function renderBoard(fake: FakeWhiteboardProvider, sessionId = "s1", onClose = vi.fn()) {
  return render(
    <WhiteboardProviderContext.Provider value={() => fake}>
      <SessionWhiteboard sessionId={sessionId} authorId="me" onClose={onClose} />
    </WhiteboardProviderContext.Provider>
  );
}

describe("Whiteboard — Journey 5 collaborative board (Sprint 8.4)", () => {
  beforeEach(() => _resetBoardCache());

  it("initializes through the injected provider and shows Live once synced", async () => {
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake);
    expect(fake.calls).toContain("initialize");
    expect(await screen.findByText("Live")).toBeInTheDocument();
  });

  it("shows a synchronizing loader until connected", async () => {
    const fake = new FakeWhiteboardProvider();
    fake.autoConnect = false;
    renderBoard(fake);
    expect(await screen.findByText(/Synchronizing board/i)).toBeInTheDocument();
  });

  it("changes tool, colour, and stroke width through the provider port", async () => {
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake);
    await screen.findByText("Live");
    await userEvent.click(screen.getByRole("button", { name: "Eraser" }));
    await userEvent.click(screen.getByRole("button", { name: "Colour #ef4444" }));
    await userEvent.click(screen.getByRole("button", { name: "Width 8" }));
    expect(fake.calls).toContain("setTool:eraser");
    expect(fake.calls).toContain("setColor:#ef4444");
    expect(fake.calls).toContain("setStrokeWidth:8");
    // Current tool indicator reflects the selection.
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "true");
  });

  it("undo and redo call the provider", async () => {
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake);
    await screen.findByText("Live");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(fake.calls).toContain("undo");
    expect(fake.calls).toContain("redo");
  });

  it("clear board requires confirmation", async () => {
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake);
    await screen.findByText("Live");
    // Cancel path: no clear.
    await userEvent.click(screen.getByRole("button", { name: "Clear board" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fake.calls).not.toContain("clear");
    // Confirm path: clears.
    await userEvent.click(screen.getByRole("button", { name: "Clear board" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Clear board" }));
    expect(fake.calls).toContain("clear");
  });

  it("restores a preserved board on late join (importState)", async () => {
    const snapshot: WhiteboardSnapshot = {
      operations: [{ type: "stroke", id: "s1", authorId: "peer", tool: "pen", color: "#000", width: 2, points: [{ x: 0.1, y: 0.1 }] }],
    };
    saveBoardSnapshot("late-session", snapshot);
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake, "late-session");
    await screen.findByText("Live");
    expect(fake.calls).toContain("importState");
    expect(fake.ops).toEqual(snapshot.operations);
  });

  it("preserves the board in memory when the panel unmounts (leave)", async () => {
    const fake = new FakeWhiteboardProvider();
    fake.ops = [{ type: "clear", id: "c1", authorId: "me" }];
    const { unmount } = renderBoard(fake, "keep-session");
    await screen.findByText("Live");
    unmount();
    expect(fake.calls).toContain("destroy");
    expect(loadBoardSnapshot("keep-session")).toEqual({ operations: fake.ops });
  });

  it("shows a reconnecting indicator and recovers", async () => {
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake);
    await screen.findByText("Live");
    act(() => fake.emit("reconnecting"));
    await waitFor(() => expect(screen.getAllByText("Reconnecting…").length).toBeGreaterThan(0));
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryAllByText("Reconnecting…")).toHaveLength(0));
  });

  it("surfaces a provider error without ending the meeting", async () => {
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake);
    await screen.findByText("Live");
    act(() => fake.emitError("sync_failed"));
    expect(await screen.findByText(/Couldn’t sync the board/i)).toBeInTheDocument();
    // Board is still present (meeting continues).
    expect(screen.getByLabelText("Whiteboard")).toBeInTheDocument();
  });

  it("drives the board exclusively through the injected provider (component stays pure)", async () => {
    const fake = new FakeWhiteboardProvider();
    renderBoard(fake);
    await screen.findByText("Live");
    await userEvent.click(screen.getByRole("button", { name: "Pointer" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    const allowed = /^(initialize|destroy|clear|undo|redo|setTool:|setColor:|setStrokeWidth:|importState|applyOperation)/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
  });

  it("closes via the close button", async () => {
    const fake = new FakeWhiteboardProvider();
    const onClose = vi.fn();
    renderBoard(fake, "s1", onClose);
    await screen.findByText("Live");
    await userEvent.click(screen.getByLabelText("Close whiteboard"));
    expect(onClose).toHaveBeenCalled();
  });
});
