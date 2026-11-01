import type { NavItem } from "@/components/AppShell";

export const ADMIN_NAV: NavItem[] = [
  { label: "Admin Console", icon: "dashboard", href: "/admin" },
  { label: "Student Roster", icon: "school", href: "/admin/students" },
  { label: "Notices & Messages", icon: "forum", href: "/admin/comms" },
  { label: "Content & Records", icon: "library_books", href: "/admin/content" },
  { label: "Staff Accounts", icon: "badge", href: "/admin/teachers" },
  { label: "System & Audit", icon: "monitor_heart", href: "/admin/system" },
];
