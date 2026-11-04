import type { components } from "@/lib/api-types";

export type Site = components["schemas"]["SiteContent"];
type TextKey = Exclude<keyof Site, "contacts" | "schools">;

/** Built-in landing copy. The public page shows these when a `site` key is empty; the admin form uses them as placeholders. */
export const SITE_DEFAULTS: Record<TextKey, string> = {
  hero_badge: "Centenary Vision • NAAC A+ Grade (CGPA 3.41) • NIRF Top Rank",
  hero_title: "Empowering Aspirations,\nConnecting Excellence.",
  hero_text:
    "The central conduit between world-class talent and global pioneers. Tezpur University Training & Placement Cell orchestrates campus talent acquisitions, industrial internships, and skill development across 27 post-graduate & engineering departments.",
  brochure_label: "Placement Brochure 2024–25",
  schools_title: "Schools & Disciplines on Offer",
  schools_text:
    "A multi-disciplinary ecosystem preparing over 4,000 scholars with industry-aligned curricula, research labs, and hands-on capstone projects.",
  brochure_title: "Official Placement Brochure",
  brochure_text:
    "Gain complete clarity into graduating batches, department-wise student demographics, course curricula, cutting-edge laboratory infrastructure, past compensation curves, and logistical travel guidelines to Napaam campus.",
  directorate_title: "Training & Placement Directorate",
  directorate_text: "Direct institutional channels for company registrations, pre-placement talks, and hospitality arrangements.",
};

export const TEXT_FIELDS: { key: TextKey; label: string; long?: boolean; hint?: string }[] = [
  { key: "hero_badge", label: "Hero badge", hint: "Blank uses the university ranking, then the built-in text." },
  { key: "hero_title", label: "Hero headline", long: true, hint: "A new line becomes a line break." },
  { key: "hero_text", label: "Hero intro paragraph", long: true },
  { key: "brochure_label", label: "Hero brochure button label" },
  { key: "schools_title", label: "Schools section title" },
  { key: "schools_text", label: "Schools section blurb", long: true },
  { key: "brochure_title", label: "Brochure card title" },
  { key: "brochure_text", label: "Brochure card text", long: true },
  { key: "directorate_title", label: "Directorate card title" },
  { key: "directorate_text", label: "Directorate card text", long: true },
];

/** Per-school card copy from the Figma frame; departments not listed get a generic card. */
export const SCHOOL_DEFAULTS: Record<string, { icon: string; tag: string; foot: string; footIcon: string }> = {
  "School of Engineering": { icon: "memory", tag: "AICTE & NBA Accredited", foot: "B.Tech / M.Tech / Ph.D", footIcon: "trending_up" },
  "School of Management Sciences": { icon: "query_stats", tag: "Established 1995", foot: "Dual Specialization MBA", footIcon: "bar_chart" },
  "School of Sciences": { icon: "science", tag: "DST-FIST Supported", foot: "Integrated M.Sc / Ph.D", footIcon: "biotech" },
  "School of Humanities & Social Sciences": { icon: "record_voice_over", tag: "Communication & Public Policy", foot: "MA / MSW / Ph.D", footIcon: "public" },
};

export const defaultContacts = (email: string, phone: string) => [
  { name: "Ms. Deena Davy", role: "Director & In-Charge, T&P Cell", line: `Email: ${email}` },
  { name: "Ms. Deena Davy", role: "Placement Officer & Corporate Liaison", line: `Phone: ${phone}` },
];
