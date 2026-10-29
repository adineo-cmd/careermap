# Compass Content Spec (roadmap JSON v1)

This spec defines the exact JSON format for Compass roadmap files. Follow it precisely.
Files live in `content/roadmaps/<slug>.json`. All content must be strictly valid JSON
(no trailing commas, no comments, UTF-8, straight quotes escaped properly).

## Top-level object

```json
{
  "slug": "accounting",
  "title": "Accounting & Finance",
  "tagline": "One-line description shown on cards and page headers (max 120 chars).",
  "summary": "2–3 sentence description for the roadmap page header and SEO.",
  "category": "Business & Finance",
  "color": "#f7b955",
  "icon": "briefcase",
  "onetRoles": ["13-2011.00", "13-2051.00"],
  "jelCodes": ["M41", "M42"],
  "sources": [
    {"label": "O*NET — Accountants and Auditors", "url": "https://www.onetonline.org/link/summary/13-2011.00"},
    {"label": "BLS Occupational Outlook Handbook — Accountants and Auditors", "url": "https://www.bls.gov/ooh/business-and-financial/accountants-and-auditors.htm"}
  ],
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

Field rules:
- `slug`: kebab-case, matches filename.
- `color`: one hex accent color for the roadmap (used on cards, group borders, thumbnails).
- `icon`: one of `briefcase, users, megaphone, trending-up, clipboard, truck, heart, book-open, scale, brain, graduation-cap`.
- `onetRoles`: 2–6 real O*NET-SOC 2019 codes (format `NN-NNNN.NN`) for the core occupations of this path.
- `jelCodes`: 1–5 valid JEL classification codes relevant to the field (e.g. M41 Accounting).
- `sources`: 2–6 authoritative sources actually used to ground the content (O*NET summary pages, BLS OOH pages, certification-body pages). Only include URLs you are confident exist.

## Node types

`nodes` is an array of three item types, mixed:

### 1. `node` — a clickable topic box
```json
{
  "id": "acc-debits-credits",
  "type": "node",
  "label": "Debits & Credits",
  "variant": "primary",
  "x": 350, "y": 240, "w": 220, "h": 44,
  "detail": {
    "description": "2–4 sentences: what this topic/skill actually is.",
    "why": "1–2 sentences: why it matters for this career.",
    "learn": ["Concrete, checkable learning outcome 1", "Outcome 2", "Outcome 3"],
    "skills": ["O*NET-style skill name 1", "Skill name 2"],
    "certs": [{"name": "CPA", "issuer": "NASBA / AICPA", "note": "One-line real requirement summary"}],
    "resources": [{"title": "Khan Academy — Finance and capital markets", "url": "https://www.khanacademy.org/economics-finance-domain", "kind": "course"}],
    "roles": ["13-2011.00"],
    "tasks": ["Task phrased like an O*NET task statement (optional, 0–3)"]
  }
}
```

- `id`: kebab-case, unique across the whole file, prefixed with the slug's short prefix (e.g. `acc-`).
- `label`: SHORT (aim ≤ 26 chars, hard max 34). It renders on one line inside a box.
- `variant`: `primary` (default gray/white), `accent` (roadmap accent color border — use sparingly for milestones/entry points), or `muted` (dimmer, for optional/elective topics). Omit for primary.
- Every `node` MUST have a full `detail`.

### 2. `group` — a dashed container that visually encloses its member nodes
```json
{
  "id": "acc-g-foundation",
  "type": "group",
  "label": "FOUNDATION",
  "x": 340, "y": 180, "w": 260, "h": 330
}
```
- `label`: UPPERCASE, short stage name (e.g. `FOUNDATION`, `CORE SKILLS`, `CERTIFICATIONS & CAREER`).
- The rectangle MUST geometrically contain all its member nodes with padding: nodes at least 28px from left/right/bottom edges and 66px from the top edge (the top strip holds the label). It must NOT overlap nodes that aren't members, and groups must not overlap each other.
- Groups are optional decorative context — not required for every node.

### 3. `label` — plain text on the canvas
```json
{ "id": "acc-l-hint", "type": "label", "label": "Pick one specialist track", "x": 900, "y": 820, "w": 240 }
```
- Use sparingly (0–3 per roadmap) for wayfinding hints. `w` is the text wrap width (120–280). Height is auto.

## Edges

```json
{ "from": "acc-foundations", "to": "acc-debits-credits" }
{ "from": "acc-managerial", "to": "acc-cma-track", "dashed": true }
```
- Edges may ONLY connect items of `type: node`. The renderer routes connectors automatically between box borders — no coordinates needed.
- `dashed: true` marks optional/alternative paths. Default is a solid arrow.
- Direction is meaningful: `from` comes before `to` in the learning progression.
- Do not create edges that cross more than 2–3 other boxes; design the flow to be readable top-to-bottom.
- Total edges roughly 1.1–1.5 × node count (a progression tree, not spaghetti).

## Geometry & layout conventions (canvas width = 1440)

- Think of the canvas as 5 columns. Node `w` = 200–240 (default 220). Column left edges at x = 60, 340, 620, 900, 1180 (so nodes span 60–280, 340–560, ... 1180–1400).
- Node `h` = 44 for one-line labels.
- Flow is TOP → BOTTOM. Rows step down by ≥ 84px between consecutive levels (e.g. y = 60, 160, 260, 380, 500 ...). Bigger vertical gaps (120–160) before a new stage look good.
- A roadmap should have 3–6 major "stages" (top to bottom), optionally each wrapped in a `group`.
- Branches: a node can fan out to 2–4 children (e.g. specialist tracks) — spread children across columns.
- Keep everything within x ∈ [40, 1400] and y ≥ 40. Do not exceed y ≈ 2600 (roadmap total height; longer is fine if content demands, but stay under ~3200).
- Nodes in the same row must not overlap: keep ≥ 24px horizontal gap between any two boxes (including between nodes and group borders they don't belong to).

## Content volume

- 26–34 `node` items per roadmap. Every node needs real, substantive detail.
- 4–6 `group` items for the major stages.
- 0–3 `label` items.

## Detail content rules (VERIFICATION BAR — this is the "professional grade" part)

1. **Certifications**: only real certifications you are certain about, with correct issuer and correctly stated core requirements in `note`. Good examples: CPA (NASBA/AICPA — 150 semester hours, 4-section Uniform CPA Exam), CMA (IMA), CFA Institute (3 levels), PMP (PMI — ~35 contact hours of PM education + documented leading of projects), CAPM (PMI), SHRM-CP/SCP (SHRM), PHR/SPHR (HRCI), CPIM/CSCP/CLTD (ASCM), NCLEX-RN (NCSBN), RHIA/RHIT (AHIMA), CMA (AAMA) for medical assistants, NALA CP for paralegals, NBCC/CACREP context for counseling, PRAXIS (ETS) for teachers, National Board Certification (NBPTS). If unsure a cert exists → omit it. Never invent a certification.
2. **No salary numbers.** Do not state wages/salaries. Instead, when career-relevant, add a resource link to the BLS Occupational Outlook Handbook page for the occupation.
3. **Resources**: 1–4 per node, ONLY well-known, stable URLs you are confident exist. Prefer free: khanacademy.org, openstax.org, coursera.org (audit), edx.org, ocw.mit.edu, bls.gov/ooh/..., onetonline.org, investopedia.com, hbr.org, pmi.org, shrm.org, imanet.org, ascm.org, asq.org, ncsbn.org, nursingworld.org, nhanow.com, ahima.org, aama-ntl.org, ets.org, nbpts.org, ed.gov, lsac.org, americanbar.org, nala.org, apa.org, nbcc.org, cacrep.org, naswpress.org? (skip if unsure), skillshop.withgoogle.com (Google Skillshop), academy.hubspot.com, analytics.google.com, ga4 docs, support.google.com, irs.gov, sba.gov, un.org? (no), who.int (ok), cdc.gov (ok). `kind` ∈ course, guide, book, video, tool, certification, community.
4. **Skills**: use O*NET-style skill names (e.g. "Active Listening", "Monitoring", "Coordination", "Judgment and Decision Making", "Financial statement analysis").
5. **Tasks**: phrase like O*NET task statements ("Prepare, examine, or analyze accounting records, financial statements, or other financial reports...").
6. **Tone**: crisp, concrete, professional. No fluff ("In today's fast-paced world..."), no hype, no first person.
7. **Geography**: US-centric for licensure/certs is fine, but add one `label` note or resource acknowledging international variants (e.g. ACCA for accounting, IELTS/praxis equivalents) where clearly relevant.
8. **Learning outcomes** in `learn` must be actionable and specific ("Read a balance sheet and identify its five major sections", not "Learn about balance sheets").

## Example (mini but complete — copy this shape)

```json
{
  "slug": "example",
  "title": "Example Path",
  "tagline": "Short one-liner.",
  "summary": "Two or three sentences describing the whole path, who it is for, and where it leads.",
  "category": "Business & Finance",
  "color": "#f7b955",
  "icon": "briefcase",
  "onetRoles": ["13-2011.00"],
  "jelCodes": ["M41"],
  "sources": [
    {"label": "O*NET — Accountants and Auditors", "url": "https://www.onetonline.org/link/summary/13-2011.00"}
  ],
  "nodes": [
    { "id": "ex-foundations", "type": "node", "label": "Foundations", "x": 620, "y": 60, "w": 220, "h": 44,
      "detail": {
        "description": "What it is, in plain language.",
        "why": "Why it matters.",
        "learn": ["Concrete outcome one", "Concrete outcome two", "Concrete outcome three"],
        "skills": ["Active Listening", "Critical Thinking"],
        "certs": [],
        "resources": [{"title": "BLS OOH — Accountants and Auditors", "url": "https://www.bls.gov/ooh/business-and-financial/accountants-and-auditors.htm", "kind": "guide"}],
        "roles": ["13-2011.00"]
      }
    },
    { "id": "ex-g-start", "type": "group", "label": "START HERE", "x": 584, "y": 20, "w": 292, "h": 158 },
    { "id": "ex-opt-a", "type": "node", "label": "Option A", "variant": "muted", "x": 340, "y": 240, "w": 220, "h": 44, "detail": { "description": "...", "why": "...", "learn": ["..."], "skills": ["..."], "certs": [], "resources": [{"title": "...", "url": "https://example.com", "kind": "guide"}], "roles": [] } },
    { "id": "ex-opt-b", "type": "node", "label": "Option B", "x": 620, "y": 240, "w": 220, "h": 44, "detail": { "description": "...", "why": "...", "learn": ["..."], "skills": ["..."], "certs": [], "resources": [{"title": "...", "url": "https://example.com", "kind": "guide"}], "roles": [] } }
  ],
  "edges": [
    { "from": "ex-foundations", "to": "ex-opt-a" },
    { "from": "ex-foundations", "to": "ex-opt-b" },
    { "from": "ex-opt-b", "to": "ex-opt-a", "dashed": true }
  ]
}
```

(Note: the example `ex-opt-*` detail objects are abbreviated here — real files must have full detail everywhere.)
