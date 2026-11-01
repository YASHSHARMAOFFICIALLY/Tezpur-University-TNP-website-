import createClient, { type Middleware } from "openapi-fetch";
import { useSyncExternalStore } from "react";
import { mutate } from "swr";
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
  const userChanged = s?.user.id !== getSession()?.user.id;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
  // SWR keys aren't per-user, so a different (or no) user starts from an empty cache. Revalidating also drops SWR's
  // 2 s dedupe markers, without which the new user's pages would wait on the previous user's finished requests.
  if (userChanged) void mutate(() => true, undefined, { revalidate: !!s });
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
// Only a 401 means the refresh token is dead; an outage or network error keeps the 30-day session for the next try.
async function refresh(s: Session) {
  const down = new ApiError("NETWORK", "The server isn't responding. Try again in a moment.");
  const r = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  }).catch(() => {
    throw down;
  });
  if (r.status === 401) return setSession(null);
  if (!r.ok) throw down;
  setSession((await r.json()) as Session);
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
  // Only a rejected token ends the session (a wrong password is also a 401), and only if no newer login replaced it meanwhile.
  async onResponse({ request, response }) {
    if (response.status !== 401) return response;
    const s = getSession();
    if (!s || request.headers.get("Authorization") !== `Bearer ${s.access_token}`) return response;
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { error?: ErrorBody } | null;
    if (body?.error?.code === "UNAUTHENTICATED" || body?.error?.code === "REFRESH_INVALID") setSession(null);
    return response;
  },
};
api.use(auth);

/** Unwrap an openapi-fetch result: data on 2xx, ApiError (backend's plain-English message) otherwise. */
export async function call<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let res;
  try {
    res = await p;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  if (res.response.ok) return res.data as T;
  const e = (res.error as { error?: ErrorBody } | undefined)?.error;
  if (!e && res.response.status >= 500) throw new ApiError("NETWORK", "The server isn't responding. Try again in a moment.");
  const reason = typeof e?.details?.reason === "string" ? `: ${e.details.reason}` : "";
  throw new ApiError(e?.code ?? "INTERNAL", (e?.message ?? `Request failed (${res.response.status})`) + reason, e?.details);
}

type Page<T> = { data: T[]; page: { cursor: string | null; has_more: boolean } };

/** Follow the backend's cursor until the list ends; a single page silently drops every row after the limit. */
export async function listAll<T>(fetchPage: (cursor?: string) => Promise<Page<T>>, maxPages = 50): Promise<{ data: T[] }> {
  const data: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const p = await fetchPage(cursor);
    data.push(...p.data);
    if (!p.page.has_more || !p.page.cursor) return { data };
    cursor = p.page.cursor;
  }
  throw new ApiError("INTERNAL", "This list is too long to load in full. Contact the T&P cell.");
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
