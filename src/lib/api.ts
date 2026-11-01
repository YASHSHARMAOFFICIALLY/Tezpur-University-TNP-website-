import createClient, { type Middleware } from "openapi-fetch";
import { useSyncExternalStore } from "react";
import type { components, paths } from "./api-types";

export type Session = components["schemas"]["Session"];
export type Role = Session["user"]["role"];
type ErrorBody = components["schemas"]["Error"]["error"];

export class ApiError extends Error {
  constructor(
    public code: ErrorBody["code"] | "NETWORK",
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// ---- session (localStorage + subscribe so React re-renders on login/logout) ----
const KEY = "tnp.session";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: Session | null } = { raw: null, value: null };

export function getSession(): Session | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cached.raw) cached = { raw, value: raw ? (JSON.parse(raw) as Session) : null };
  return cached.value;
}

export function setSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

/** undefined while rendering on the server (unknown), null when logged out. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, getSession, () => undefined);
}

export const homeFor = (role: Role) => ({ admin: "/admin", student: "/student", company: "/recruiter" })[role];

// ---- client ----
export const api = createClient<paths>({ baseUrl: "" });

function expiresSoon(token: string) {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

let refreshing: Promise<void> | null = null;
async function refresh(s: Session) {
  const r = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  setSession(r.ok ? ((await r.json()) as Session) : null);
}

// Refresh before the request instead of retrying after a 401: a retried request would need its body twice.
const auth: Middleware = {
  async onRequest({ request }) {
    let s = getSession();
    if (!s || request.url.includes("/auth/refresh")) return request;
    if (expiresSoon(s.access_token)) {
      refreshing ??= refresh(s).finally(() => (refreshing = null));
      await refreshing;
      s = getSession();
    }
    if (s) request.headers.set("Authorization", `Bearer ${s.access_token}`);
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401 && getSession()) setSession(null);
    return response;
  },
};
api.use(auth);

/** Unwrap an openapi-fetch result: data on 2xx, ApiError (backend's plain-English message) otherwise. */
export async function call<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let res;
  try {
    res = await p;
  } catch {
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  if (res.response.ok) return res.data as T;
  const e = (res.error as { error?: ErrorBody } | undefined)?.error;
  if (!e && res.response.status >= 500) throw new ApiError("NETWORK", "The server isn't responding. Try again in a moment.");
  const reason = typeof e?.details?.reason === "string" ? `: ${e.details.reason}` : "";
  throw new ApiError(e?.code ?? "INTERNAL", (e?.message ?? `Request failed (${res.response.status})`) + reason, e?.details);
}

/** Multipart upload with one `file` field, as every upload endpoint expects. */
export const fileBody = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return { body: fd as never, bodySerializer: (b: unknown) => b as FormData };
};

/** /files/:id needs the bearer token, so open it via a blob URL instead of a plain link. */
export async function openFile(id: string) {
  const r = await call(api.GET("/api/v1/files/{id}", { params: { path: { id } }, parseAs: "blob" }));
  window.open(URL.createObjectURL(r as Blob), "_blank", "noopener");
}

export async function logout() {
  await api.POST("/api/v1/auth/logout").catch(() => {});
  setSession(null);
}

/** Object URL for an auth-protected file (photos, etc.), cached by SWR. */
export async function fileUrl(id: string) {
  const blob = await call(api.GET("/api/v1/files/{id}", { params: { path: { id } }, parseAs: "blob" }));
  return URL.createObjectURL(blob as Blob);
}
