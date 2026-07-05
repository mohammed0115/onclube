// Provider-neutral in-session file-sharing contract.
//
// This is the ONLY surface the UI/hooks talk to. No browser File / Blob /
// FileReader / DataTransfer type ever crosses this boundary — the provider owns
// all File objects. Swapping stores (S3/Azure Blob/GCS/MinIO/local) means writing
// a new adapter that implements `FileSharingProvider`, with zero changes to the
// hook, the panel, the domain, or the API. The shared DTO carries metadata only.

import type { DragEvent } from "react";

export type FileConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

/** Drag & drop handlers the hook supplies for the panel to bind — File
 * extraction happens inside the handlers, never in the presentation layer. */
export interface DropzoneProps {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

export type SharedFileStatus = "uploading" | "available" | "failed";

/** Metadata for one shared file. NEVER carries a browser File/Blob. */
export interface SharedFile {
  id: string;
  name: string;
  size: number;
  contentType: string;
  extension: string;
  uploaderId: string;
  uploaderName: string;
  uploadedAt: string; // ISO 8601
  status: SharedFileStatus;
  progress: number; // 0..100
}

export type FileErrorCode =
  | "upload_failed"
  | "download_failed"
  | "unsupported_type"
  | "oversized_file"
  | "upload_cancelled"
  | "connection_lost"
  | "provider_unavailable"
  | "unknown";

export class FileShareError extends Error {
  code: FileErrorCode;
  fileName?: string;
  constructor(code: FileErrorCode, fileName?: string, message?: string) {
    super(message ?? code);
    this.name = "FileShareError";
    this.code = code;
    this.fileName = fileName;
  }
}

export interface FileIdentity {
  uploaderId: string;
  uploaderName: string;
}

/** Provider → app event callbacks. The adapter pushes; it never pulls. */
export interface FileSharingEvents {
  onConnectionState(state: FileConnectionState): void;
  onUploadStarted(file: SharedFile): void;
  onUploadProgress(update: { id: string; progress: number }): void;
  onUploadCompleted(file: SharedFile): void;
  onUploadFailed(update: { id: string; code: FileErrorCode }): void;
  onFileRemoved(id: string): void;
  onRemoteFileReceived(file: SharedFile): void;
}

export interface FileConnectOptions {
  sessionId: string;
  identity: FileIdentity;
  events: FileSharingEvents;
}

/**
 * The file-sharing port. A real adapter (S3/Azure/GCS/MinIO/local) implements
 * this and lives entirely in infrastructure. ALL File/Blob/upload/download
 * mechanics happen inside the provider — callers pass a File in and get metadata
 * out; they never see bytes.
 */
export interface FileSharingProvider {
  connect(opts: FileConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  /** Accepts a browser File (boundary-in only) and returns metadata. */
  upload(file: File): Promise<SharedFile>;
  cancelUpload(fileId: string): void;
  download(fileId: string): Promise<void>;
  remove(fileId: string): Promise<void>;
  listFiles(): SharedFile[];
  connectionState(): FileConnectionState;
}

export type FileSharingProviderFactory = () => FileSharingProvider;
