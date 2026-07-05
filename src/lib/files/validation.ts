// Transport-neutral file validation (business rule, not provider concern).
// Mirrors the backend domain rule `domain/rules/files.py`.

export const ALLOWED_EXTENSIONS = ["pdf", "docx", "pptx", "txt", "png", "jpg", "jpeg"] as const;
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// Allowed content types per extension (empty type is tolerated — some browsers
// omit it). Anything present but mismatched is rejected.
const CONTENT_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: ["text/plain"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
};

export type FileValidation = { ok: true } | { ok: false; code: "unsupported_type" | "oversized_file" };

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function validateUpload(meta: { name: string; size: number; type?: string }): FileValidation {
  const ext = extensionOf(meta.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, code: "unsupported_type" };
  if (meta.type && !CONTENT_TYPES[ext]?.includes(meta.type)) return { ok: false, code: "unsupported_type" };
  if (meta.size <= 0 || meta.size > MAX_FILE_SIZE_BYTES) return { ok: false, code: "oversized_file" };
  return { ok: true };
}
