// Centralized API client.
//
// Responsibilities (all cross-cutting — never in views):
//   * Base URL + JSON handling
//   * JWT bearer auth, with single-flight automatic refresh on 401
//   * Normalized errors (ApiError carries status + backend `code`)
//   * A logout signal when the session is unrecoverable
//
// Pages/hooks never read tokens or touch fetch directly; they call the typed
// per-domain modules which call this.
import type { ApiErrorBody, TokenPair } from "./types";
import { newRequestId, recordEvent, setLastRequestId } from "@/lib/diagnostics";

const BASE = "/api/v1";

const ACCESS_KEY = "ec_access";
const REFRESH_KEY = "ec_refresh";

// ── token store ───────────────────────────────────────────────────────────────
export const tokenStore = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set(tokens: { access: string; refresh?: string }) {
    localStorage.setItem(ACCESS_KEY, tokens.access);
    if (tokens.refresh) localStorage.setItem(REFRESH_KEY, tokens.refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// Broadcast an unrecoverable-auth event; AuthProvider listens and redirects.
export const AUTH_LOGOUT_EVENT = "ec:auth-logout";
function signalLogout() {
  tokenStore.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
  }
}

// ── error type ────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  status: number;
  code: string;
  detail: unknown;
  constructor(status: number, body: Partial<ApiErrorBody> | null, fallback: string) {
    const code = body?.code ?? "error";
    super(typeof body?.detail === "string" ? body.detail : fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = body?.detail ?? fallback;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Send the Authorization header (default true). */
  auth?: boolean;
  /** When true, `body` is a FormData and Content-Type is left to the browser. */
  form?: boolean;
  signal?: AbortSignal;
}

// ── single-flight refresh ─────────────────────────────────────────────────────
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    const refresh = tokenStore.refresh();
    if (!refresh) {
      signalLogout();
      return Promise.reject(new ApiError(401, { code: "not_authenticated" }, "Session expired"));
    }
    refreshing = fetch(`${BASE}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
      .then(async (res) => {
        if (!res.ok) {
          signalLogout();
          throw new ApiError(res.status, await safeJson(res), "Could not refresh session");
        }
        const data = (await res.json()) as { access: string };
        tokenStore.set({ access: data.access });
        return data.access;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function safeJson(res: Response): Promise<ApiErrorBody | null> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

async function rawRequest<T>(path: string, opts: RequestOptions, accessOverride?: string): Promise<T> {
  const { method = "GET", body, auth = true, form = false, signal } = opts;
  const headers: Record<string, string> = {};
  if (!form && body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const access = accessOverride ?? tokenStore.access();
    if (access) headers["Authorization"] = `Bearer ${access}`;
  }
  // Request correlation: propagate a client-generated request id (the server
  // echoes/overrides it and returns X-Request-ID). Observability only.
  const requestId = newRequestId();
  headers["X-Request-ID"] = requestId;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : form ? (body as BodyInit) : JSON.stringify(body),
  });

  const serverRequestId = res.headers.get("X-Request-ID") ?? requestId;
  setLastRequestId(serverRequestId);
  if (!res.ok) recordEvent("http.error", { status: res.status, path }, serverRequestId);

  if (res.status === 204) return undefined as T;
  if (res.ok) return (await res.json()) as T;

  const errBody = await safeJson(res);
  throw new ApiError(res.status, errBody, res.statusText || "Request failed");
}

/**
 * Make an authenticated request, transparently refreshing the access token once
 * on a 401 and retrying. A failed refresh signals logout.
 */
export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, opts);
  } catch (err) {
    const canRetry =
      err instanceof ApiError &&
      err.status === 401 &&
      opts.auth !== false &&
      !!tokenStore.refresh();
    if (!canRetry) throw err;
    const access = await refreshAccessToken();
    return rawRequest<T>(path, opts, access);
  }
}

// Convenience verbs.
export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  del: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: "DELETE" }),
  postForm: <T>(path: string, form: FormData, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", body: form, form: true }),
};

export type { TokenPair };
