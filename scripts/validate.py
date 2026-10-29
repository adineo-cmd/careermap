#!/usr/bin/env python3
"""Validate Compass roadmap content files against content/SPEC.md."""
import json, sys, re, glob, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROADMAP_DIR = os.path.join(ROOT, "content", "roadmaps")
CANVAS_W = 1440
MAX_Y = 3200

ERRORS, WARNINGS = [], []

def err(f, msg): ERRORS.append(f"{os.path.basename(f)}: ERROR: {msg}")
def warn(f, msg): WARNINGS.append(f"{os.path.basename(f)}: WARN: {msg}")

def overlap(a, b, gap=6):
    return (a["x"] < b["x"] + b["w"] + gap and b["x"] < a["x"] + a["w"] + gap
            and a["y"] < b["y"] + b["h"] + gap and b["y"] < a["y"] + a["h"] + gap)

RES_KINDS = {"course", "guide", "book", "video", "tool", "certification", "community"}

def check_roadmap(path):
    slug = os.path.splitext(os.path.basename(path))[0]
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        err(path, f"JSON parse failure: {e}")
        return
    # top-level
    for k in ["slug", "title", "tagline", "summary", "category", "color", "icon", "onetRoles", "jelCodes", "sources", "nodes", "edges"]:
        if k not in d: err(path, f"missing top-level key '{k}'")
    if d.get("slug") != slug: err(path, f"slug '{d.get('slug')}' != filename '{slug}'")
    for code in d.get("onetRoles", []):
        if not re.fullmatch(r"\d{2}-\d{4}\.\d{2}", code): err(path, f"bad O*NET code '{code}'")
    for code in d.get("jelCodes", []):
        if not re.fullmatch(r"[A-Z]\d{1,2}", code): err(path, f"bad JEL code '{code}'")
    for s in d.get("sources", []):
        if not (isinstance(s, dict) and s.get("label") and str(s.get("url", "")).startswith("http")):
            err(path, f"bad source entry {s}")

    nodes, groups, labels, ids = [], [], [], set()
    for n in d.get("nodes", []):
        nid, ntype = n.get("id"), n.get("type")
        if not nid or not re.fullmatch(r"[a-z0-9-]+", str(nid)): err(path, f"bad id '{nid}'")
        if nid in ids: err(path, f"duplicate id '{nid}'")
        ids.add(nid)
        if ntype == "node":
            nodes.append(n)
        elif ntype == "group":
            groups.append(n)
        elif ntype == "label":
            labels.append(n)
        else:
            err(path, f"item '{nid}' has bad type '{ntype}'")
            continue
        # geometry
        for k in ("x", "y", "w"):
            if k not in n: err(path, f"item '{nid}' missing '{k}'")
        if ntype in ("node", "group") and "h" not in n: err(path, f"item '{nid}' missing 'h'")
        if ntype == "node":
            if not (170 <= n.get("w", 0) <= 260): err(path, f"node '{nid}' w={n.get('w')} out of 170..260")
            if not (36 <= n.get("h", 0) <= 64): err(path, f"node '{nid}' h={n.get('h')} out of 36..64")
            if len(n.get("label", "")) > 34: err(path, f"node '{nid}' label too long ({len(n['label'])} chars): {n['label']!r}")
            if n.get("variant") not in (None, "primary", "accent", "muted"): err(path, f"node '{nid}' bad variant '{n.get('variant')}'")
        if n.get("x", 0) < 30 or n.get("x", 0) + n.get("w", 0) > CANVAS_W:
            err(path, f"item '{nid}' outside canvas x-range ({n.get('x')}..{n.get('x',0)+n.get('w',0)})")
        if n.get("y", 0) < 30 or n.get("y", 0) > MAX_Y:
            err(path, f"item '{nid}' y={n.get('y')} outside range")
        if ntype in ("node", "group") and n.get("y", 0) + n.get("h", 0) > MAX_Y:
            err(path, f"item '{nid}' bottom exceeds canvas height")
        if ntype in ("group", "label") and not n.get("label"):
            err(path, f"item '{nid}' missing label")

    if not (18 <= len(nodes) <= 36): warn(path, f"{len(nodes)} nodes (spec suggests 26-34)")
    if not (3 <= len(groups) <= 7): warn(path, f"{len(groups)} groups (spec suggests 4-6)")
    if len(labels) > 3: warn(path, f"{len(labels)} labels (max 3 suggested)")

    # node-node overlap
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            if overlap(nodes[i], nodes[j]):
                err(path, f"nodes '{nodes[i]['id']}' and '{nodes[j]['id']}' overlap")

    # group containment + non-membership
    node_rects = {n["id"]: n for n in nodes}
    for g in groups:
        gx, gy, gw, gh = g["x"], g["y"], g["w"], g["h"]
        members, partial = [], []
        for n in nodes:
            nx, ny, nw, nh = n["x"], n["y"], n["w"], n["h"]
            inside = nx >= gx + 24 and ny >= gy + 62 and nx + nw <= gx + gw - 24 and ny + nh <= gy + gh - 20
            touches = not (nx + nw < gx or nx > gx + gw or ny + nh < gy or ny > gy + gh)
            if touches:
                if inside: members.append(n["id"])
                else: partial.append(n["id"])
        if not members: err(path, f"group '{g['id']}' contains no node fully inside")
        for pid in partial:
            err(path, f"group '{g['id']}' partially overlaps node '{pid}' (padding: left/right>=24, top>=62, bottom>=20)")
        if g.get("label") and g["label"] != g["label"].upper(): warn(path, f"group '{g['id']}' label not uppercase")

    # group-group overlap
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            if overlap(groups[i], groups[j], gap=10):
                err(path, f"groups '{groups[i]['id']}' and '{groups[j]['id']}' overlap")

    # edges
    seen_edges = set()
    for e in d.get("edges", []):
        f_, t_ = e.get("from"), e.get("to")
        key = (f_, t_)
        if key in seen_edges: err(path, f"duplicate edge {f_} -> {t_}")
        seen_edges.add(key)
        for end in (f_, t_):
            if end not in node_rects:
                err(path, f"edge references missing/non-node id '{end}'")
        if f_ == t_: err(path, "self edge")

    ne, nn = len(d.get("edges", [])), len(nodes)
    if ne < 0.7 * nn: warn(path, f"only {ne} edges for {nn} nodes — flow looks sparse")
    if ne > 2.2 * nn: warn(path, f"{ne} edges for {nn} nodes — spaghetti risk")

    # node details
    for n in nodes:
        det = n.get("detail")
        nid = n["id"]
        if not isinstance(det, dict):
            err(path, f"node '{nid}' missing detail"); continue
        if not det.get("description") or len(det["description"]) < 40:
            err(path, f"node '{nid}' description missing/too short")
        if not det.get("why") or len(det["why"]) < 20:
            err(path, f"node '{nid}' why missing/too short")
        if not isinstance(det.get("learn"), list) or len(det["learn"]) < 3:
            err(path, f"node '{nid}' needs >=3 learn items")
        if not isinstance(det.get("skills"), list) or len(det["skills"]) < 2:
            err(path, f"node '{nid}' needs >=2 skills")
        for c in det.get("certs", []):
            if not (isinstance(c, dict) and c.get("name") and c.get("issuer") and c.get("note")):
                err(path, f"node '{nid}' malformed cert {c}")
        res = det.get("resources", [])
        if not isinstance(res, list) or len(res) < 1:
            err(path, f"node '{nid}' needs >=1 resource")
        for r in res:
            if not (isinstance(r, dict) and r.get("title") and str(r.get("url", "")).startswith("http")
                    and r.get("kind") in RES_KINDS):
                err(path, f"node '{nid}' malformed resource {r}")
        for code in det.get("roles", []):
            if not re.fullmatch(r"\d{2}-\d{4}\.\d{2}", code): err(path, f"node '{nid}' bad role code '{code}'")

def main():
    files = sorted(glob.glob(os.path.join(ROADMAP_DIR, "*.json")))
    if not files:
        print("No roadmap files found."); sys.exit(1)
    for f in files: check_roadmap(f)
    for w in WARNINGS: print(w)
    for e in ERRORS: print(e)
    print(f"\n{len(files)} file(s) checked — {len(ERRORS)} error(s), {len(WARNINGS)} warning(s)")
    sys.exit(1 if ERRORS else 0)

if __name__ == "__main__":
    main()
