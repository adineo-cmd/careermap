#!/usr/bin/env python3
"""Seed the CareerMap SQLite database from content/*.json files."""
import json, os, sqlite3, glob, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "roadmap.db")
CONTENT = os.path.join(ROOT, "content")

SCHEMA = """
PRAGMA journal_mode = WAL;
DROP TABLE IF EXISTS roadmaps;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS careers;
DROP TABLE IF EXISTS jel_codes;

CREATE TABLE roadmaps (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    tagline TEXT,
    summary TEXT,
    category TEXT,
    color TEXT,
    icon TEXT,
    onet_roles TEXT,   -- JSON array
    jel_codes TEXT,    -- JSON array
    sources TEXT,      -- JSON array of {label,url}
    parent TEXT,       -- slug of parent roadmap for specializations (nullable)
    node_count INTEGER,
    edge_count INTEGER,
    sort INTEGER
);

CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL REFERENCES roadmaps(slug),
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL,   -- node | group | label
    label TEXT,
    variant TEXT,
    x REAL, y REAL, w REAL, h REAL,
    detail TEXT,               -- JSON, nodes only
    sort INTEGER
);
CREATE INDEX idx_items_slug ON items(slug);
CREATE INDEX idx_items_label ON items(label);

CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL REFERENCES roadmaps(slug),
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    dashed INTEGER DEFAULT 0,
    sort INTEGER
);
CREATE INDEX idx_edges_slug ON edges(slug);

CREATE TABLE careers (
    code TEXT PRIMARY KEY,      -- O*NET-SOC code
    title TEXT NOT NULL,
    family_code TEXT,
    family_name TEXT,
    summary TEXT,
    url TEXT
);
CREATE INDEX idx_careers_family ON careers(family_code);

CREATE TABLE jel_codes (
    code TEXT PRIMARY KEY,      -- JEL code (top-level or sub)
    name TEXT NOT NULL,
    level TEXT,                 -- top | sub
    note TEXT,
    related TEXT                -- JSON array of roadmap slugs
);
"""


def seed():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    cur = con.cursor()

    roadmap_files = sorted(glob.glob(os.path.join(CONTENT, "roadmaps", "*.json")))
    for i, path in enumerate(roadmap_files):
        d = json.load(open(path, encoding="utf-8"))
        nodes = [n for n in d["nodes"] if n.get("type") == "node"]
        cur.execute(
            "INSERT INTO roadmaps VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                d["slug"], d["title"], d.get("tagline", ""), d.get("summary", ""),
                d.get("category", ""), d.get("color", "#f7b955"), d.get("icon", "book-open"),
                json.dumps(d.get("onetRoles", [])), json.dumps(d.get("jelCodes", [])),
                json.dumps(d.get("sources", [])), d.get("parent"),
                len(nodes), len(d.get("edges", [])), i,
            ),
        )
        for j, n in enumerate(d["nodes"]):
            cur.execute(
                "INSERT INTO items (slug, item_id, item_type, label, variant, x, y, w, h, detail, sort) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    d["slug"], n["id"], n["type"], n.get("label", ""), n.get("variant"),
                    n.get("x", 0), n.get("y", 0), n.get("w", 220), n.get("h", 44),
                    json.dumps(n.get("detail")) if n.get("detail") else None, j,
                ),
            )
        for j, e in enumerate(d.get("edges", [])):
            cur.execute(
                "INSERT INTO edges (slug, from_id, to_id, dashed, sort) VALUES (?,?,?,?,?)",
                (d["slug"], e["from"], e["to"], 1 if e.get("dashed") else 0, j),
            )
        print(f"  seeded roadmap  {d['slug']:22s} {len(nodes):2d} nodes  {len(d.get('edges', [])):2d} edges")

    careers_path = os.path.join(CONTENT, "careers", "onetsoc.json")
    if os.path.exists(careers_path):
        lib = json.load(open(careers_path, encoding="utf-8"))
        n_roles = 0
        for fam in lib["families"]:
            for r in fam["roles"]:
                cur.execute(
                    "INSERT OR REPLACE INTO careers VALUES (?,?,?,?,?,?)",
                    (r["code"], r["title"], fam["code"], fam["name"], r.get("summary", ""), r.get("url", "")),
                )
                n_roles += 1
        print(f"  seeded careers  {n_roles} roles across {len(lib['families'])} families")

    jel_path = os.path.join(CONTENT, "jel.json")
    if os.path.exists(jel_path):
        jel = json.load(open(jel_path, encoding="utf-8"))
        for c in jel["categories"]:
            cur.execute("INSERT OR REPLACE INTO jel_codes VALUES (?,?,?,?,?)",
                        (c["code"], c["name"], "top", c.get("note"), "[]"))
        for c in jel["codes"]:
            cur.execute("INSERT OR REPLACE INTO jel_codes VALUES (?,?,?,?,?)",
                        (c["code"], c["name"], "sub", None, json.dumps(c.get("related", []))))
        print(f"  seeded jel      {len(jel['categories'])} categories, {len(jel['codes'])} codes")

    con.commit()
    con.close()
    print(f"Database written to {DB_PATH}")


if __name__ == "__main__":
    seed()
