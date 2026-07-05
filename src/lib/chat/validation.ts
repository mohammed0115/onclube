// Transport-neutral message validation (business rule, not transport concern).
// Mirrors the backend domain rule `domain/rules/chat.py`.

export const MAX_CHAT_MESSAGE_LENGTH = 2000;

export type MessageValidation =
  | { ok: true; text: string }
  | { ok: false; code: "empty_message" | "oversized_message" };

/** Trim, reject empty/whitespace-only, enforce the maximum length. */
export function validateChatMessage(raw: string): MessageValidation {
  const text = raw.trim();
  if (!text) return { ok: false, code: "empty_message" };
  if (text.length > MAX_CHAT_MESSAGE_LENGTH) return { ok: false, code: "oversized_message" };
  return { ok: true, text };
}
