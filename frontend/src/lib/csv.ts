/** Spreadsheet apps run a cell that starts with = + - @ (or a tab / CR) as a formula; a leading ' keeps it text. */
const cell = (v: unknown) =>
  `"${String(v ?? "")
    .replace(/^[=+\-@\t\r]/, "'$&")
    .replace(/"/g, '""')}"`;

export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n");

export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
