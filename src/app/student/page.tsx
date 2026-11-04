"use client";

import { AppShell, type NavItem } from "@/components/AppShell";
import { Applications } from "./applications";
import { Drives } from "./drives";
import { NoticeBanner, ProfileCard } from "./profile";
import { Records } from "./records";
import { Training } from "./training";

const NAV: NavItem[] = [
  { label: "Profile", icon: "person", href: "#profile" },
  { label: "My applications", icon: "conversion_path", href: "#applications" },
  { label: "Open drives", icon: "work", href: "#drives" },
  { label: "Training & workshops", icon: "lightbulb", href: "#training" },
  { label: "Certificates & projects", icon: "folder_shared", href: "#records" },
];

export default function StudentPage() {
  return (
    <AppShell role="student" nav={NAV} active="#profile">
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        <NoticeBanner />
        <ProfileCard />
        <Applications />
        <Drives />
        <Training />
        <Records />
      </div>
    </AppShell>
  );
}
