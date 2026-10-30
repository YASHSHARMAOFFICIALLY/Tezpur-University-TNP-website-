// The API may only grow. Fails if any path+method or component in the baseline spec is missing or changed.
// usage: npx tsx scripts/check-additive-openapi.ts <baseline.json> [current.json = openapi.json, written by npm test]
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

type Spec = { paths: Record<string, Record<string, unknown>>; components?: Record<string, Record<string, unknown>> };
const [basePath, curPath = "openapi.json"] = process.argv.slice(2);
if (!basePath) {
  console.error("usage: check-additive-openapi.ts <baseline.json> [current.json]");
  process.exit(2);
}
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8")) as Spec;
const base = read(basePath);
const cur = read(curPath);

const broken: string[] = [];
let checked = 0;
for (const [p, ops] of Object.entries(base.paths))
  for (const [m, op] of Object.entries(ops)) {
    checked++;
    const now = cur.paths[p]?.[m];
    if (now === undefined) broken.push(`missing  ${m.toUpperCase()} ${p}`);
    else if (!isDeepStrictEqual(op, now)) broken.push(`changed  ${m.toUpperCase()} ${p}`);
  }
for (const [section, items] of Object.entries(base.components ?? {}))
  for (const [name, schema] of Object.entries(items)) {
    checked++;
    const now = cur.components?.[section]?.[name];
    if (now === undefined) broken.push(`missing  components.${section}.${name}`);
    else if (!isDeepStrictEqual(schema, now)) broken.push(`changed  components.${section}.${name}`);
  }

const added = Object.entries(cur.paths).flatMap(([p, ops]) => Object.keys(ops).filter((m) => !base.paths[p]?.[m]).map((m) => `${m.toUpperCase()} ${p}`));
if (broken.length) {
  console.error(`NOT additive: ${broken.length} of ${checked} baseline entries differ\n${broken.join("\n")}`);
  process.exit(1);
}
console.log(`additive: ${checked} baseline entries unchanged, ${added.length} operations added`);
for (const a of added) console.log(`  + ${a}`);
