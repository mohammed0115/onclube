// In-memory shared-file list cache (NO persistence, NO permanent storage).
//
// Business rules:
//   - Leaving the session KEEPS shared files available → save on teardown.
//   - Ending the session DESTROYS temporary files → destroySessionFiles() clears it.
//   - Late joiners RECEIVE the current file list → load on connect.
// Metadata only (no blobs); lives in the browser tab's memory for the page's life.
import type { SharedFile } from "./types";

const cache = new Map<string, SharedFile[]>();

export function saveSharedFiles(sessionId: string, files: SharedFile[]): void {
  cache.set(sessionId, files);
}

export function loadSharedFiles(sessionId: string): SharedFile[] {
  return cache.get(sessionId) ?? [];
}

/** Ending the session: temporary files are gone. */
export function destroySessionFiles(sessionId: string): void {
  cache.delete(sessionId);
}

/** Test helper — wipe all cached lists. */
export function _resetFileCache(): void {
  cache.clear();
}
