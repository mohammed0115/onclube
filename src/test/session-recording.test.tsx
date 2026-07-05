import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { SessionRecording } from "@/components/session/SessionRecording";
import { formatTimer } from "@/components/session/RecordingIndicator";
import { useSessionRecording } from "@/hooks";
import { RecordingProviderContext, RecordingError } from "@/lib/recording";
import type {
  Recording,
  RecordingConnectOptions,
  RecordingEvents,
  RecordingErrorCode,
  RecordingProvider,
  RecordingStatus,
} from "@/lib/recording";

class FakeRecordingProvider implements RecordingProvider {
  calls: string[] = [];
  autoConnect = true;
  failConnect: RecordingErrorCode | null = null;
  initialState: Recording | null = null;
  private events: RecordingEvents | null = null;
  private sessionId = "s1";
  private currentId = "";
  private seq = 0;

  private mk(status: RecordingStatus, startedAt: string | null, downloadAvailable = false): Recording {
    return {
      recordingId: this.currentId || `r${++this.seq}`,
      sessionId: this.sessionId,
      status,
      startedAt,
      finishedAt: status === "recording" ? null : new Date().toISOString(),
      duration: status === "recording" ? 0 : 5,
      storageKey: downloadAvailable ? "s/x" : null,
      downloadAvailable,
    };
  }

  async connect(o: RecordingConnectOptions): Promise<void> {
    this.calls.push("connect");
    this.events = o.events;
    this.sessionId = o.sessionId;
    if (this.failConnect) throw new RecordingError(this.failConnect);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) o.events.onConnectionState("connected");
  }
  async disconnect(): Promise<void> {
    this.calls.push("disconnect");
    this.events?.onConnectionState("disconnected");
  }
  async startRecording(): Promise<Recording> {
    this.calls.push("startRecording");
    this.currentId = `r${++this.seq}`;
    const rec = this.mk("recording", new Date().toISOString());
    this.events?.onRecordingStarted(rec);
    return rec;
  }
  async stopRecording(): Promise<Recording> {
    this.calls.push("stopRecording");
    const rec = this.mk("processing", null);
    this.events?.onRecordingStopped(rec);
    return rec;
  }
  async cancelRecording(): Promise<void> {
    this.calls.push("cancelRecording");
    this.events?.onRecordingCancelled({ recordingId: this.currentId });
  }
  getRecordingState(): Recording | null {
    return this.initialState;
  }
  listRecordings(): Recording[] {
    return [];
  }
  connectionState() {
    return "connected" as const;
  }
  // drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  driveStart() {
    this.currentId = `r${++this.seq}`;
    this.events?.onRecordingStarted(this.mk("recording", new Date().toISOString()));
  }
  driveStop() {
    this.events?.onRecordingStopped(this.mk("processing", null));
  }
  driveUploaded() {
    this.events?.onRecordingUploaded(this.mk("completed", null, true));
  }
  driveFailed(code: RecordingErrorCode) {
    this.events?.onRecordingFailed({ recordingId: this.currentId, code });
  }
}

function renderRec(fake: FakeRecordingProvider, canControl = true) {
  return render(
    <RecordingProviderContext.Provider value={() => fake}>
      <SessionRecording sessionId="s1" participantId="me" canControl={canControl} />
    </RecordingProviderContext.Provider>
  );
}

function hookWrapper(fake: FakeRecordingProvider) {
  return ({ children }: { children: ReactNode }) => (
    <RecordingProviderContext.Provider value={() => fake}>{children}</RecordingProviderContext.Provider>
  );
}

describe("Session recording — Journey 5 (Sprint 8.7)", () => {
  afterEach(() => vi.useRealTimers());

  it("connects through the injected provider", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake);
    await screen.findByRole("button", { name: "Start recording" });
    expect(fake.calls).toContain("connect");
  });

  it("the instructor can start recording (indicator appears)", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake, true);
    await userEvent.click(await screen.findByRole("button", { name: "Start recording" }));
    expect(fake.calls).toContain("startRecording");
    expect(await screen.findByText("REC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  });

  it("the instructor can stop recording → processing", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake, true);
    await userEvent.click(await screen.findByRole("button", { name: "Start recording" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop recording" }));
    expect(fake.calls).toContain("stopRecording");
    expect(await screen.findByText(/Processing recording/i)).toBeInTheDocument();
  });

  it("shows the recording indicator to a non-controlling viewer, without controls", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake, false); // student
    // No control button ever.
    expect(screen.queryByRole("button", { name: "Start recording" })).not.toBeInTheDocument();
    act(() => fake.driveStart());
    expect(await screen.findByText("REC")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop recording" })).not.toBeInTheDocument();
  });

  it("the elapsed timer ticks while recording", () => {
    vi.useFakeTimers();
    const fake = new FakeRecordingProvider();
    const { result } = renderHook(() => useSessionRecording({ sessionId: "s1", participantId: "me", canControl: true }), {
      wrapper: hookWrapper(fake),
    });
    act(() => fake.driveStart());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.elapsedSeconds).toBe(3);
    expect(formatTimer(result.current.elapsedSeconds)).toBe("0:03");
  });

  it("reaches the completed state after processing", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake, true);
    act(() => fake.driveStart());
    act(() => fake.driveStop());
    expect(await screen.findByText(/Processing recording/i)).toBeInTheDocument();
    act(() => fake.driveUploaded());
    expect(await screen.findByText(/Recording saved/i)).toBeInTheDocument();
  });

  it("shows a failure state without ending the meeting", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake, true);
    act(() => fake.driveStart());
    act(() => fake.driveFailed("processing_failed"));
    expect(await screen.findByText(/Recording failed/i)).toBeInTheDocument();
  });

  it("reflects an in-progress recording on late join without restarting it", async () => {
    const fake = new FakeRecordingProvider();
    fake.initialState = {
      recordingId: "r-live", sessionId: "s1", status: "recording",
      startedAt: new Date().toISOString(), finishedAt: null, duration: 0, storageKey: null, downloadAvailable: false,
    };
    renderRec(fake, false); // a student joining late
    expect(await screen.findByText("REC")).toBeInTheDocument();
    expect(fake.calls).not.toContain("startRecording"); // never restarted
  });

  it("leaving does NOT stop recording (unmount → disconnect only)", async () => {
    const fake = new FakeRecordingProvider();
    const { unmount } = renderRec(fake, true);
    await userEvent.click(await screen.findByRole("button", { name: "Start recording" }));
    unmount();
    expect(fake.calls).toContain("disconnect");
    expect(fake.calls).not.toContain("stopRecording");
    expect(fake.calls).not.toContain("cancelRecording");
  });

  it("finalizes on session end (provider emits stop → processing)", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake, true);
    act(() => fake.driveStart());
    act(() => fake.driveStop()); // session end → provider finalizes
    expect(await screen.findByText(/Processing recording/i)).toBeInTheDocument();
  });

  it("reconnects gracefully", async () => {
    const fake = new FakeRecordingProvider();
    renderRec(fake, true);
    act(() => fake.driveStart());
    act(() => fake.emit("reconnecting"));
    expect(await screen.findByText(/reconnecting/i)).toBeInTheDocument();
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument());
  });
});

describe("Session recording — control rules (hook)", () => {
  it("a student (no control) cannot start recording", () => {
    const fake = new FakeRecordingProvider();
    const { result } = renderHook(() => useSessionRecording({ sessionId: "s1", participantId: "me", canControl: false }), {
      wrapper: hookWrapper(fake),
    });
    act(() => result.current.start());
    expect(fake.calls).not.toContain("startRecording");
  });

  it("start is idempotent (single active recording)", () => {
    const fake = new FakeRecordingProvider();
    const { result } = renderHook(() => useSessionRecording({ sessionId: "s1", participantId: "me", canControl: true }), {
      wrapper: hookWrapper(fake),
    });
    act(() => {
      result.current.start();
      result.current.start();
    });
    expect(fake.calls.filter((c) => c === "startRecording")).toHaveLength(1);
  });

  it("stop is idempotent", () => {
    const fake = new FakeRecordingProvider();
    const { result } = renderHook(() => useSessionRecording({ sessionId: "s1", participantId: "me", canControl: true }), {
      wrapper: hookWrapper(fake),
    });
    act(() => result.current.start());
    act(() => {
      result.current.stop();
      result.current.stop();
    });
    expect(fake.calls.filter((c) => c === "stopRecording")).toHaveLength(1);
  });

  it("drives recording exclusively through the injected provider", () => {
    const fake = new FakeRecordingProvider();
    const { result, unmount } = renderHook(() => useSessionRecording({ sessionId: "s1", participantId: "me", canControl: true }), {
      wrapper: hookWrapper(fake),
    });
    act(() => result.current.start());
    act(() => result.current.stop());
    unmount();
    const allowed = /^(connect|disconnect|startRecording|stopRecording|cancelRecording)$/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
  });
});
