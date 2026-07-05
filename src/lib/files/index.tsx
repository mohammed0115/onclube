// File-sharing infrastructure barrel + dependency injection.
//
// The UI resolves its provider from context, so tests (and a future real adapter
// — S3/Azure/GCS/MinIO) inject a different factory without touching pages or hooks.
import { createContext, useContext } from "react";
import type { FileSharingProviderFactory } from "./types";
import { createStubFileSharingProvider } from "./stubProvider";

export * from "./types";
export * from "./validation";
export { StubFileSharingProvider, createStubFileSharingProvider } from "./stubProvider";
export { saveSharedFiles, loadSharedFiles, destroySessionFiles, _resetFileCache } from "./fileCache";

export const FileSharingProviderContext = createContext<FileSharingProviderFactory>(
  createStubFileSharingProvider
);

export const useFileSharingProviderFactory = (): FileSharingProviderFactory =>
  useContext(FileSharingProviderContext);
