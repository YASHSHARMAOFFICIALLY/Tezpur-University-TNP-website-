/**
 * Course = degree level, read from the programme name's first word ("M.Tech Data Science" -> "M.Tech").
 * ponytail: name prefix, not a DB column; add a `course` column when the T&P office fixes the course list.
 */
export const courseOf = (name: string) => name.split(" ")[0] ?? name;

export const coursesOf = (programmes: { name: string }[]) => {
  const names = programmes.map((p) => courseOf(p.name));
  return [...new Set(names)].sort();
};
