"use client";

import { useSyncExternalStore } from "react";
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

/** The sidebar picks one focused screen instead of scrolling past every section. The URL hash is the state. */
const subscribe = (cb: () => void) => (addEventListener("hashchange", cb), () => removeEventListener("hashchange", cb));
const currentHash = () => (NAV.some((n) => n.href === location.hash) ? location.hash : "#profile");

export default function StudentPage() {
  const view = useSyncExternalStore(subscribe, currentHash, () => "#profile");
  return (
    <AppShell role="student" nav={NAV} active={view}>
      <div className="mx-auto flex max-w-[976px] flex-col gap-5">
        {view === "#profile" && (
          <>
            <NoticeBanner />
            <ProfileCard />
          </>
        )}
        {view === "#applications" && <Applications />}
        {view === "#drives" && <Drives />}
        {view === "#training" && <Training />}
        {view === "#records" && <Records />}
      </div>
    </AppShell>
  );
}
