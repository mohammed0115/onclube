// In-memory board snapshot cache (NO persistence, NO storage, NO backend).
//
// Business rules:
//   - Leaving the meeting PRESERVES the board in memory → save on teardown.
//   - Ending the meeting DESTROYS the board → destroyBoard() clears it.
//   - Late joiners RECEIVE the current board → load on init, then replay ops.
// This lives only in the browser tab's memory for the lifetime of the page.
import type { WhiteboardSnapshot } from "./types";

const cache = new Map<string, WhiteboardSnapshot>();

export function saveBoardSnapshot(sessionId: string, snapshot: WhiteboardSnapshot): void {
  cache.set(sessionId, snapshot);
}

export function loadBoardSnapshot(sessionId: string): WhiteboardSnapshot | null {
  return cache.get(sessionId) ?? null;
}

/** Ending the meeting: the board is gone. */
export function destroyBoard(sessionId: string): void {
  cache.delete(sessionId);
}

/** Test helper — wipe all cached boards. */
export function _resetBoardCache(): void {
  cache.clear();
}
