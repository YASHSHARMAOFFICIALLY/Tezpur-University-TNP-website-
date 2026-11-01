"""Print compact response (or request with -q) schemas for endpoints. usage: python3 -I scripts/schema.py [-q] 'get /api/v1/x' ..."""
import json, sys
s = json.load(open(__file__.rsplit("/", 2)[0] + "/../backend/openapi.json"))
def short(sc, d=0):
    if "$ref" in sc: return short(s["components"]["schemas"][sc["$ref"].split("/")[-1]], d)
    if "enum" in sc: return "|".join(map(str, sc["enum"]))
    if "oneOf" in sc: return " OR ".join(json.dumps(short(x, d + 1)) for x in sc["oneOf"])
    t = sc.get("type")
    if isinstance(t, list): t = [x for x in t if x != "null"][0] + "?"
    if t in ("object", "object?") and d < 5: return {k: short(v, d + 1) for k, v in sc.get("properties", {}).items()}
    if t in ("array", "array?"): return [short(sc.get("items", {}), d + 1)]
    if "anyOf" in sc: return " | ".join(str(short(x, d + 1)) for x in sc["anyOf"])
    return t
args = sys.argv[1:]; req = args and args[0] == "-q"; args = args[1:] if req else args
for a in args:
    m, p = a.split(" ", 1); op = s["paths"][p][m]
    if req:
        rb = op.get("requestBody"); q = [x["name"] for x in op.get("parameters", []) if x["in"] == "query"]
        print(a, "query=", q, "body=", json.dumps(short(rb["content"]["application/json"]["schema"])) if rb else None)
    else:
        r = next(v for k, v in op["responses"].items() if k.startswith("2"))
        print(a, "=>", json.dumps(short(r.get("content", {}).get("application/json", {}).get("schema", {}))))
