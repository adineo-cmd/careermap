"""Freeze the dynamic API into static JSON for GitHub Pages.

Boots server.py on a scratch port, captures every endpoint response into
public/api/, and writes a full search index for client-side filtering.
Run after scripts/seed.py. Standard library only.
"""
import json
import os
import sqlite3
import subprocess
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "roadmap.db")
OUT = os.path.join(ROOT, "public", "api")
PORT = 8971


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main():
    os.makedirs(os.path.join(OUT, "roadmaps"), exist_ok=True)
    srv = subprocess.Popen(
        ["python3", "server.py"], cwd=ROOT, env={**os.environ, "PORT": str(PORT)}
    )
    try:
        base = f"http://127.0.0.1:{PORT}"
        for _ in range(50):
            try:
                get(base + "/api/health")
                break
            except Exception:
                time.sleep(0.2)
        roadmaps = get(base + "/api/roadmaps")
        for name, payload in (
            ("roadmaps", roadmaps),
            ("careers", get(base + "/api/careers")),
            ("fields", get(base + "/api/fields")),
        ):
            with open(os.path.join(OUT, f"{name}.json"), "w") as fh:
                json.dump(payload, fh)
            print(f"api/{name}.json")
        for rm in roadmaps["roadmaps"]:
            slug = rm["slug"]
            detail = get(base + f"/api/roadmaps/{slug}")
            with open(os.path.join(OUT, "roadmaps", f"{slug}.json"), "w") as fh:
                json.dump(detail, fh)
            print(f"api/roadmaps/{slug}.json")
    finally:
        srv.terminate()
        srv.wait()

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    index = {"roadmaps": [], "topics": [], "careers": []}
    cur.execute("SELECT slug,title,tagline,summary,category,color,icon FROM roadmaps")
    index["roadmaps"] = [dict(r) for r in cur.fetchall()]
    cur.execute(
        "SELECT i.slug, i.item_id, i.label, r.title AS roadmap_title, r.color "
        "FROM items i JOIN roadmaps r ON r.slug=i.slug WHERE i.item_type='node'"
    )
    index["topics"] = [
        {"slug": t["slug"], "item_id": t["item_id"], "label": t["label"],
         "roadmap": t["roadmap_title"], "color": t["color"]}
        for t in cur.fetchall()
    ]
    cur.execute("SELECT code,title,family_name,summary,url FROM careers")
    index["careers"] = [dict(r) for r in cur.fetchall()]
    con.close()
    with open(os.path.join(OUT, "search-index.json"), "w") as fh:
        json.dump(index, fh)
    print(f"api/search-index.json ({len(index['roadmaps'])} roadmaps, "
          f"{len(index['topics'])} topics, {len(index['careers'])} careers)")


if __name__ == "__main__":
    main()
