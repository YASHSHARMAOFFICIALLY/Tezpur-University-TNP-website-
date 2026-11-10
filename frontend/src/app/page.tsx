import { Suspense } from "react";
import { connection } from "next/server";
import { SWRConfig } from "swr";
import Landing from "./Landing";

const API = `${process.env.BACKEND_URL ?? "http://localhost:3000"}/api/v1`;
const get = (path: string) => fetch(`${API}/${path}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : undefined), () => undefined);

/** No fallback tree: a second Landing under Suspense would remount (and reset form state) when the data tree replaces it. The data resolves in the same response, so nothing waits on JS. */
/** The landing data rides in the first HTML (server to API is local), so the admin's text is there at first paint. The keys match the client's useSWR keys, which then revalidate quietly. */
async function Prefetched() {
  await connection();
  const [university, programmes, records] = await Promise.all([get("university"), get("programmes"), get("placement-records")]);
  const fallback = Object.fromEntries(Object.entries({ university, programmes, "placement-records": records }).filter(([, v]) => v !== undefined));
  return (
    <SWRConfig value={{ fallback }}>
      <Landing />
    </SWRConfig>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Prefetched />
    </Suspense>
  );
}
