#!/usr/bin/env python3
"""CareerMap server — zero-dependency (Python stdlib only).

Serves the static frontend from public/ and a JSON API backed by data/roadmap.db.
No authentication, no accounts — the site is free for users.
"""
import json, os, sqlite3, sys, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
DB_PATH = os.path.join(ROOT, "data", "roadmap.db")

sys.path.insert(0, os.path.join(ROOT, "scripts"))

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}


def get_db():
    if not os.path.exists(DB_PATH):
        import seed
        seed.seed()
    return sqlite3.connect(DB_PATH)


def rows_to_dicts(cur, rows):
    return [dict(zip([c[0] for c in cur.description], r)) for r in rows]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # ------------ helpers ------------
    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path):
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            self.send_error(404)
            return
        ext = os.path.splitext(path)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        if ext in (".html", ".css", ".js", ".svg"):
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    # ------------ API ------------
    def api_roadmaps(self):
        con = get_db()
        cur = con.cursor()
        cur.execute(
            "SELECT slug,title,tagline,summary,category,color,icon,node_count,edge_count,"
            "onet_roles,jel_codes,sources,parent FROM roadmaps ORDER BY sort"
        )
        out = []
        for r in rows_to_dicts(cur, cur.fetchall()):
            r["onetRoles"] = json.loads(r.pop("onet_roles"))
            r["jelCodes"] = json.loads(r.pop("jel_codes"))
            r["sources"] = json.loads(r.pop("sources"))
            r["nodeCount"] = r.pop("node_count")
            r["edgeCount"] = r.pop("edge_count")
            out.append(r)
        con.close()
        self.send_json({"roadmaps": out})

    def api_roadmap_detail(self, slug):
        con = get_db()
        cur = con.cursor()
        cur.execute(
            "SELECT slug,title,tagline,summary,category,color,icon,node_count,edge_count,"
            "onet_roles,jel_codes,sources,parent FROM roadmaps WHERE slug=?",
            (slug,),
        )
        rows = rows_to_dicts(cur, cur.fetchall())
        if not rows:
            self.send_json({"error": "roadmap not found"}, 404)
            con.close()
            return
        r = rows[0]
        r["onetRoles"] = json.loads(r.pop("onet_roles"))
        r["jelCodes"] = json.loads(r.pop("jel_codes"))
        r["sources"] = json.loads(r.pop("sources"))
        r["nodeCount"] = r.pop("node_count")
        r["edgeCount"] = r.pop("edge_count")

        cur.execute(
            "SELECT item_id,item_type,label,variant,x,y,w,h,detail FROM items "
            "WHERE slug=? ORDER BY sort", (slug,)
        )
        items = []
        for it in rows_to_dicts(cur, cur.fetchall()):
            it["id"] = it.pop("item_id")
            it["type"] = it.pop("item_type")
            it["detail"] = json.loads(it["detail"]) if it.get("detail") else None
            items.append(it)
        r["items"] = items

        cur.execute("SELECT from_id,to_id,dashed FROM edges WHERE slug=? ORDER BY sort", (slug,))
        r["edges"] = [
            {"from": e[0], "to": e[1], "dashed": bool(e[2])} for e in cur.fetchall()
        ]
        con.close()
        self.send_json(r)

    def api_careers(self):
        con = get_db()
        cur = con.cursor()
        cur.execute("SELECT code,title,family_code,family_name,summary,url FROM careers ORDER BY code")
        roles = rows_to_dicts(cur, cur.fetchall())
        con.close()
        families, fam_map = [], {}
        for r in roles:
            fam = fam_map.get(r["family_code"])
            if fam is None:
                fam = {"code": r["family_code"], "name": r["family_name"], "roles": []}
                fam_map[r["family_code"]] = fam
                families.append(fam)
            fam["roles"].append(r)
        self.send_json({"families": families})

    def api_fields(self):
        con = get_db()
        cur = con.cursor()
        cur.execute("SELECT code,name,level,note,related FROM jel_codes")
        codes = rows_to_dicts(cur, cur.fetchall())
        for c in codes:
            c["related"] = json.loads(c.pop("related"))
        con.close()
        self.send_json({
            "codes": codes,
            "meta": {
                "title": "JEL Classification — Fields of Economics Mapped to Careers",
                "description": "The Journal of Economic Literature (JEL) classification, maintained by the "
                               "American Economic Association, organizes economic research by field. CareerMap "
                               "maps each roadmap to the JEL fields it belongs to.",
                "source": "American Economic Association — JEL Classification System",
                "url": "https://www.aeaweb.org/econlit/jelCodes",
            },
        })

    def api_search(self, q):
        q = (q or "").strip()
        if len(q) < 2:
            self.send_json({"roadmaps": [], "topics": [], "careers": []})
            return
        like = f"%{q}%"
        con = get_db()
        cur = con.cursor()
        cur.execute(
            "SELECT slug,title,tagline,category,color,icon FROM roadmaps "
            "WHERE title LIKE ? OR tagline LIKE ? OR summary LIKE ? LIMIT 6", (like, like, like))
        roadmaps = rows_to_dicts(cur, cur.fetchall())
        cur.execute(
            "SELECT i.slug, i.item_id, i.label, r.title AS roadmap_title, r.color "
            "FROM items i JOIN roadmaps r ON r.slug=i.slug "
            "WHERE i.item_type='node' AND i.label LIKE ? LIMIT 12", (like,))
        topics = [{"slug": t[0], "id": t[1], "label": t[2], "roadmap": t[3], "color": t[4]}
                  for t in cur.fetchall()]
        cur.execute(
            "SELECT code,title,family_name,summary,url FROM careers "
            "WHERE title LIKE ? OR summary LIKE ? LIMIT 10", (like, like))
        careers = rows_to_dicts(cur, cur.fetchall())
        con.close()
        self.send_json({"roadmaps": roadmaps, "topics": topics, "careers": careers})

    # ------------ routing ------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path, query = parsed.path, urllib.parse.parse_qs(parsed.query)

        if path == "/api/health":
            self.send_json({"ok": True}); return
        if path == "/api/roadmaps":
            self.api_roadmaps(); return
        if path.startswith("/api/roadmaps/"):
            self.api_roadmap_detail(path[len("/api/roadmaps/"):].strip("/")); return
        if path == "/api/careers":
            self.api_careers(); return
        if path == "/api/fields":
            self.api_fields(); return
        if path == "/api/search":
            self.api_search(query.get("q", [""])[0]); return

        # static
        rel = path.lstrip("/") or "index.html"
        full = os.path.normpath(os.path.join(PUBLIC, rel))
        if not full.startswith(PUBLIC):
            self.send_error(403); return
        if not os.path.isfile(full):
            full = os.path.join(PUBLIC, "index.html")  # SPA fallback
        self.send_file(full)


def main():
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"CareerMap running  →  http://127.0.0.1:{port}   (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
