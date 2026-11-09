import useSWR from "swr";
import { api, call, listAll } from "@/lib/api";
import type { components, paths } from "@/lib/api-types";

type Json<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: { 200: { content: { "application/json": infer T } } } }
  ? T
  : paths[P][M] extends { responses: { 201: { content: { "application/json": infer T } } } }
    ? T
    : never;

export type Opp = Json<"/api/v1/opportunities", "get">["data"][number];
export type App = Json<"/api/v1/applications/mine", "get">["data"][number];
export type Ev = Json<"/api/v1/events", "get">["data"][number];
export type Reg = Json<"/api/v1/events/mine", "get">["data"][number];
export type Placement = Json<"/api/v1/students/me/placement", "get">;
export type Feedback = Json<"/api/v1/students/me/feedback", "get">[number];
export type StudentRecord = components["schemas"]["StudentRecord"];
export type Profile = components["schemas"]["StudentProfile"];
export type Programme = Json<"/api/v1/programmes", "get">[number];
export type Notice = components["schemas"]["Notice"];
export type PlacementRecord = Json<"/api/v1/placement-records", "get">[number];
/** Keys the T&P cell can fill in a year's record; every one is optional. */
export type Metrics = { placement_rate?: number; corporate_partners?: number; highest_ctc_lpa?: number; summer_internships?: number; cohort?: string };

export const useProfile = () => useSWR("students/me", () => call(api.GET("/api/v1/students/me")));
export const useApps = () =>
  useSWR("applications/mine", () => listAll((cursor) => call(api.GET("/api/v1/applications/mine", { params: { query: { limit: 100, cursor } } }))));
export const usePlacement = () => useSWR("students/me/placement", () => call(api.GET("/api/v1/students/me/placement")));
export const useFeedback = () => useSWR("students/me/feedback", () => call(api.GET("/api/v1/students/me/feedback")));
export const useMyEvents = () =>
  useSWR("events/mine", () => listAll((cursor) => call(api.GET("/api/v1/events/mine", { params: { query: { limit: 100, cursor } } }))));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (ym: string) => [ym.slice(0, 4), MONTHS[Number(ym.slice(5, 7)) - 1]] as const;

/** "2027-01" → "Jan 2027"; a range → "Jan–Mar 2027", or "Nov 2026–Feb 2027" across years. */
export function fmtMonths(from?: string | null, to?: string | null) {
  if (!from && !to) return null;
  if (!from || !to || from === to) {
    const [y, m] = parts((from ?? to)!);
    return `${m} ${y}`;
  }
  const [y1, m1] = parts(from);
  const [y2, m2] = parts(to);
  return y1 === y2 ? `${m1}–${m2} ${y2}` : `${m1} ${y1}–${m2} ${y2}`;
}

export const DRIVE_MODE = { online: "Online drive", offline: "On-campus drive", hybrid: "Hybrid drive" } as const;

// Same SWR keys and fetchers as the drives screen and the header bell, so each list is requested once per visit.
export const useOpps = () =>
  useSWR("opportunities", () => listAll((cursor) => call(api.GET("/api/v1/opportunities", { params: { query: { limit: 100, cursor } } }))));
export const useNotices = () => useSWR("noticeboard", () => call(api.GET("/api/v1/noticeboard", { params: { query: { limit: 100 } } })));
export const useRecords = () => useSWR("placement-records", () => call(api.GET("/api/v1/placement-records")));
