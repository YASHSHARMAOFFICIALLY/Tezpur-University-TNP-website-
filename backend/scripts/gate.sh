#!/bin/sh
# Release gate: every check runs, one line each, and the gate exits non-zero if any failed.
# Vitest's exit code is not trusted (wrappers have reported 0 on failing tests); the JSON report decides.
cd "$(dirname "$0")/.."
OUT=$(mktemp -d "${TMPDIR:-/tmp}/gate.XXXXXX")
failed=0
check() {
  name=$1
  shift
  if "$@" >"$OUT/$name.log" 2>&1; then
    echo "PASS $name: $(grep . "$OUT/$name.log" | tail -n 1)"
  else
    echo "FAIL $name: $(grep . "$OUT/$name.log" | tail -n 1) (log: $OUT/$name.log)"
    failed=1
  fi
}
vitest() {
  npx vitest run --reporter=json --outputFile="$OUT/vitest.json"
  [ -s "$OUT/vitest.json" ] || { echo "no vitest JSON report written"; return 1; }
  node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    console.log(`${r.numPassedTests}/${r.numTotalTests} passed, ${r.numFailedTests} failed`);
    process.exit(r.numFailedTests > 0 || r.numFailedTestSuites > 0 || r.numTotalTests === 0 ? 1 : 0)' "$OUT/vitest.json"
}
check vitest vitest
# src/generated is Prisma's output; its internal cycles are not ours to fix.
check madge npx madge --circular --extensions ts --exclude '^generated/' src
check openapi-additive npx tsx scripts/check-additive-openapi.ts docs/openapi.baseline.json openapi.json
check tsc sh -c "npx tsc -p . --noEmit && echo no type errors"
[ "$failed" = 0 ] && rm -rf "$OUT"
exit $failed
