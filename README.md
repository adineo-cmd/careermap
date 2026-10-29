# Compass — Career roadmaps for non-tech fields

A free, open, **roadmap.sh-style website for non-tech careers**: accounting, HR, marketing,
sales, project management, supply chain, healthcare, teaching, law, and psychology — with a
careers library grounded in the [O*NET-SOC](https://www.onetonline.org/) taxonomy and fields
of study mapped to the [JEL classification](https://www.aeaweb.org/econlit/jelCodes).

**No login. No accounts. No tracking.** Progress is saved in your browser's local storage.

> Inspired by [roadmap.sh](https://roadmap.sh), which does this brilliantly for software
> roles. Compass applies the same interactive roadmap-graph idea to the rest of the job
> market. (A fork-style reference of developer-roadmap lives at
> [nilbuild/developer-roadmap](https://github.com/nilbuild/developer-roadmap).)

---

## Quick start

Requires only **Python 3.8+** (standard library only — no pip installs).

```bash
python3 scripts/seed.py     # build data/roadmap.db from content/*.json (SQLite)
python3 server.py           # serve at http://127.0.0.1:8080  (PORT env to change)
```

Open **http://127.0.0.1:8080**.

Optional checks:

```bash
python3 scripts/validate.py # validate all roadmap content against the schema
```

## What's inside

| Section | Description |
| --- | --- |
| **40 career roadmaps** | 928 interactive topics. Every roadmap renders in **two views**: an OSINT Framework-style **D3.js radial tree** (default — collapsible, clickable, zoom/pan, touch-friendly) and the classic roadmap.sh-style SVG graph. Clicking any node opens its notes in a right-side drawer |
| **Topic drawer** | What it is, why it matters, a learning checklist, skills, certifications, resources, related O*NET occupations |
| **Explorer (D3.js)** | OSINT Framework–style collapsible radial tree over everything: roadmaps → stages → topics, O*NET families → occupations, JEL categories → codes. Zoom, pan, touch-friendly | 
| **Careers library** | 143 occupations across 21 O*NET-SOC families, each linking to its official O*NET summary page (IT & engineering intentionally excluded) |
| **Fields of study** | Roadmaps mapped to JEL classification codes (M41 Accounting, I21 Education, K12 Contract Law…) |
| **Global search** | Roadmaps, topics, and occupations from the header |

### Roadmaps included

Accounting & Finance · Human Resources · Digital Marketing · Sales & Business Development ·
Project Management · Supply Chain & Logistics · Healthcare Careers · Teaching & Education ·
Law & Legal Careers · Psychology & Counseling · Management & Leadership · Skilled Trades ·
Culinary & Hospitality · Public Safety & Security · Beauty & Personal Care ·
Agriculture & Environment · Arts, Media & Design · Sports & Fitness ·
Government & Public Policy · Transportation & Driving · Real Estate · Insurance ·
Banking & Financial Services · Veterinary & Animal Care · Libraries, Museums & Archives ·
Events & Tourism · Fashion & Apparel · Military & Defense

**Deeper niche paths** nest inside families via a `parent` field (12 total): Fire Service,
Police & Law Enforcement (under Public Safety), Skincare & Esthetics (under Beauty), Nursing,
Dental, Pharmacy, Paramedic & EMT (under Healthcare), Electrician, Plumbing & Pipefitting,
HVAC & Refrigeration (under Skilled Trades), Social Work (under Psychology), Baking & Pastry
(under Culinary).

## Architecture

```
compass/
├── server.py               # zero-dependency HTTP server (stdlib http.server) + JSON API
├── scripts/
│   ├── seed.py             # content/*.json  →  SQLite (data/roadmap.db)
│   └── validate.py         # schema + geometry validator for roadmap content
├── content/                # the "source of truth" — versionable JSON
│   ├── SPEC.md             # roadmap content spec (schema, layout, quality bar)
│   ├── roadmaps/*.json     # 10 roadmaps: nodes with x/y geometry, edges, details
│   ├── careers/onetsoc.json# O*NET-SOC 2019/2024 careers library
│   └── jel.json            # JEL classification mapping
├── data/roadmap.db         # generated SQLite database (rebuilt by seed.py)
├── public/                 # vanilla JS SPA (no build step)
│   ├── index.html
│   ├── css/style.css       # dark roadmap.sh-inspired theme + mobile rules
│   ├── vendor/d3.min.js    # vendored D3 v7 (no CDN dependency)
│   └── js/                 # router, SVG renderer, D3 tree explorer, views, icons
```

**Mobile:** the roadmap SVG scrolls horizontally at full legibility on phones (the roadmap.sh pattern), the drawer goes full-width, navigation becomes a swipeable row, and the Explorer supports pinch-zoom and touch dragging.

**Why a database?** All content lives in auditable JSON, gets validated
(`scripts/validate.py`), and is loaded into SQLite (`data/roadmap.db`). The API reads from
the database — so you get real queries (search across 307 topics + 139 occupations in SQL)
while the content stays diff-able in version control.

### API

| Endpoint | Returns |
| --- | --- |
| `GET /api/roadmaps` | roadmap list with metadata |
| `GET /api/roadmaps/{slug}` | full roadmap: items + edges + details |
| `GET /api/careers` | O*NET families and occupations |
| `GET /api/fields` | JEL codes with roadmap mappings |
| `GET /api/search?q=` | roadmaps, topics, careers matching a query |
| `GET /api/health` | liveness |

## Content verification methodology

- **Occupation codes** were checked against live O*NET OnLine summary pages
  (O*NET-SOC current release); retired codes found during verification were replaced
  (e.g. 21-1018 → 21-1011/21-1014, 25-9045 → 25-9042, 29-2041 → 29-2042/29-2043,
  19-3031 → 19-3033, 29-1124 → 29-9091 for athletic trainers, 41-4011 → 41-4012,
  45-2021 title corrected to Animal Breeders).
- **Certifications** are stated only where requirements are public at the issuing body
  (CPA Evolution model: 3 Core + 1 Discipline sections — verified via NASBA/AICPA;
  PMP: 36/60 months leading projects + 35 contact hours or active CAPM — verified via PMI).
- **No salary figures** anywhere; roadmaps link to the BLS Occupational Outlook Handbook
  instead so numbers stay current.
- **Resources** favor free, stable sources (Khan Academy, OpenStax, MIT OCW, official
  certification-body pages, government sites).

## Adding a roadmap

1. Copy the shape of any file in `content/roadmaps/` (see `content/SPEC.md` for the full
   schema, geometry conventions, and content rules).
2. Add groups/labels/edges; keep nodes on the 5-column grid (x = 60/340/620/900/1180).
3. Run `python3 scripts/validate.py` until clean.
4. Run `python3 scripts/seed.py` and restart the server (or just re-run seed — the server
   opens a fresh connection per request).

## Credits & data licenses

- [O*NET OnLine](https://www.onetonline.org/) — U.S. Department of Labor; public domain / CC BY 4.0.
- [JEL Classification](https://www.aeaweb.org/econlit/jelCodes) — American Economic Association.
- [Data-driven skills taxonomy](https://github.com/maudgrol/Data_driven_skills_taxonomy) — naming conventions reference.
- [roadmap.sh](https://roadmap.sh) — design inspiration (kamranahmedse/developer-roadmap).
- BLS Occupational Outlook Handbook — linked for occupational data.

Everything authored in `content/` is original work written for this project.
