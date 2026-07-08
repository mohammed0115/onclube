// Client diagnostics (Sprint 11) — operational only, no business logic.
//
// A small in-memory ring buffer of METADATA-ONLY diagnostic events (errors,
// connection changes, request/response ids). It never stores payloads, tokens,
// messages, or transcript text. Used by the error boundary, the API client
// (request-id propagation), and the connection/diagnostics hooks.

export interface DiagnosticEvent {
  at: string;
  type: string;
  requestId?: string;
  meta?: Record<string, unknown>;
}

const MAX_EVENTS = 100;
const buffer: DiagnosticEvent[] = [];
const listeners = new Set<() => void>();
let lastRequestId: string | undefined;

const SENSITIVE = /(pass|token|secret|key|auth|cert|prompt|transcript|message|content|recording|receipt)/i;

function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.test(k)) continue; // metadata only — drop anything secret-ish
    out[k] = typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v;
  }
  return out;
}

/** Generate a client request id (used as X-Request-ID when the server didn't set one). */
export function newRequestId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  return c?.randomUUID ? c.randomUUID() : `req-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export function recordEvent(type: string, meta?: Record<string, unknown>, requestId?: string): void {
  buffer.push({ at: new Date().toISOString(), type, requestId, meta: safeMeta(meta) });
  if (buffer.length > MAX_EVENTS) buffer.shift();
  listeners.forEach((l) => l());
}

export function setLastRequestId(id?: string): void {
  if (id) lastRequestId = id;
}
export function getLastRequestId(): string | undefined {
  return lastRequestId;
}
export function getEvents(): DiagnosticEvent[] {
  return [...buffer];
}
export function clearDiagnostics(): void {
  buffer.length = 0;
  lastRequestId = undefined;
  listeners.forEach((l) => l());
}
export function subscribeDiagnostics(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
