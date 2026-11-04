"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell, type NavItem } from "@/components/AppShell";
import { api, call, listAll } from "@/lib/api";
import { Candidates } from "./Candidates";
import { DriveDesk } from "./DriveDesk";
import { Messages } from "./Messages";
import { Overview } from "./Overview";
import { PostingStudio } from "./PostingStudio";
import { Postings } from "./Postings";
import { TalentPool } from "./TalentPool";

const NAV: NavItem[] = [
  { label: "Overview", icon: "domain", href: "#overview" },
  { label: "Postings", icon: "work", href: "#postings" },
  { label: "Drive Desk", icon: "timeline", href: "#drive" },
  { label: "Candidates", icon: "person_search", href: "#candidates" },
  { label: "Messages", icon: "forward_to_inbox", href: "#messages" },
  { label: "Talent Pool", icon: "groups", href: "#talent" },
];

export default function RecruiterPage() {
  const postings = useSWR("company/opportunities", () =>
    listAll((cursor) => call(api.GET("/api/v1/company/opportunities", { params: { query: { limit: 100, cursor } } }))),
  );
  const [pick, setPick] = useState<string | null>(null);
  const [studio, setStudio] = useState(false);
  const [prog, setProg] = useState("");
  const list = postings.data?.data ?? [];
  const drive = list.find((p) => p.id === pick) ?? list.find((p) => p.status === "approved") ?? list[0];
  const applicants = useSWR(drive ? ["applicants", drive.id] : null, () =>
    listAll((cursor) => call(api.GET("/api/v1/company/opportunities/{id}/applicants", { params: { path: { id: drive!.id }, query: { limit: 100, cursor } } }))),
  );
  const reload = () => postings.mutate();
  const openDrive = (id: string) => {
    setPick(id);
    document.getElementById("drive")?.scrollIntoView({ block: "start" });
  };

  return (
    <AppShell role="company" nav={NAV} active="#overview">
      <div className="mx-auto flex max-w-[912px] flex-col gap-6">
        <Overview postings={list} onCreate={() => setStudio(true)} />
        <Postings postings={postings.data?.data} current={drive?.id} onOpen={openDrive} onCreate={() => setStudio(true)} error={postings.error} reload={reload} />
        <DriveDesk postings={postings.data?.data} drive={drive} onPick={setPick} applicants={applicants.data?.data} reload={reload} error={postings.error} />
        {drive && <Candidates key={drive.id} drive={drive} q={applicants} prog={prog} setProg={setProg} />}
        <Messages />
        <TalentPool onExplore={setProg} />
      </div>
      {studio && <PostingStudio onClose={() => setStudio(false)} onDone={() => (setStudio(false), reload())} />}
    </AppShell>
  );
}
