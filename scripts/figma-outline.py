"""Condense Figma "Copy as CSS (all layers)" export to one line per layer.

usage: python3 scripts/figma-outline.py design/admin.css [start_line] [end_line]
"""
import re
import sys

KEEP = {
    "flex-direction": "dir", "justify-content": "jc", "align-items": "ai", "padding": "pad", "gap": "gap",
    "width": "w", "height": "h", "background": "bg", "border": "bd", "border-bottom": "bdb", "border-left": "bdl",
    "border-top": "bdt", "border-radius": "r", "box-shadow": "sh", "font-family": "ff", "font-weight": "fw",
    "font-size": "fs", "line-height": "lh", "letter-spacing": "ls", "text-transform": "tt", "color": "c",
    "opacity": "op", "grid-template-columns": "cols",
}
SKIP = {"Auto layout", "Inside auto layout"}


def outline(path, start=0, end=10**9):
    name, props, line_no, out = None, [], 0, []

    def flush():
        if name and props:
            out.append(f"{line_no:>6} {name} | " + " ".join(props))

    for i, raw in enumerate(open(path), 1):
        line = raw.strip()
        m = re.fullmatch(r"/\* (.*) \*/", line)
        if m:
            label = m.group(1)
            if label in SKIP or re.match(r"(or |identical to)", label):
                continue
            flush()
            name, props, line_no = label, [], i
            continue
        m = re.fullmatch(r"([a-z-]+): (.*);", line)
        if m and m.group(1) in KEEP:
            v = m.group(2).replace("'", "")
            if m.group(1) == "font-family":
                v = v.split(",")[0]
            props.append(f"{KEEP[m.group(1)]}={v}")
    flush()
    return [l for l in out if start <= int(l.split()[0]) <= end]


if __name__ == "__main__":
    args = sys.argv[1:]
    for l in outline(args[0], *(int(a) for a in args[1:3])):
        print(l)
