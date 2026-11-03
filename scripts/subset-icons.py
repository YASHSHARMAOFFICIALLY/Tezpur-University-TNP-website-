"""Shrink the 3.8MB Material Symbols font to just the icons src/ uses. Re-run after adding a new icon name.
usage: pip install fonttools brotli && python3 scripts/subset-icons.py   (from frontend/)"""
import glob, re, subprocess, sys
from fontTools.ttLib import TTFont

SRC = "node_modules/material-symbols/material-symbols-outlined.woff2"
OUT = "public/fonts/material-symbols-outlined.woff2"

font = TTFont(SRC)
cmap = font.getBestCmap()
lig = {}  # letter-glyph sequence -> icon glyph
for lookup in font["GSUB"].table.LookupList.Lookup:
    for st in lookup.SubTable:
        st = getattr(st, "ExtSubTable", st)
        for first, ligs in getattr(st, "ligatures", {}).items():
            for l in ligs:
                lig[(first, *l.Component)] = l.LigGlyph

words = set()
for f in glob.glob("src/**/*.ts*", recursive=True):
    words |= set(re.findall(r"[a-z][a-z0-9_]+", open(f).read()))
glyphs = {lig[k] for w in words if all(ord(c) in cmap for c in w) and (k := tuple(cmap[ord(c)] for c in w)) in lig}
subprocess.run(
    [sys.executable, "-m", "fontTools.subset", SRC, f"--glyphs={','.join(sorted(glyphs))}", "--unicodes=U+0030-0039,U+005F,U+0061-007A",
     "--layout-features=rlig,rclt", "--no-layout-closure", "--flavor=woff2", f"--output-file={OUT}"],
    check=True,
)
print(f"{len(glyphs)} icons -> {OUT}")
