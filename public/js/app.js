// CareerMap SPA — hash router + views (no frameworks, no accounts)
import { icon, GROUP_COLORS } from "./icons.js";
import { esc } from "./renderer.js";
import { mountRoadmapTree } from "./roadmap-tree.js";
import { viewTree } from "./tree.js";

const $app = document.getElementById("app");
const cache = {};

// ---------- shared Meridian theme ----------
const THEME_KEY = "meridian-theme";
const themeRoot = document.documentElement;

function paintThemeControls() {
  const light = themeRoot.getAttribute("data-theme") === "light";
  const label = light ? "Switch to dark theme" : "Switch to light theme";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#f3eee2" : "#0e0f0c");
}

function applyTheme(theme, persist = true) {
  const next = theme === "light" ? "light" : "dark";
  themeRoot.setAttribute("data-theme", next);
  themeRoot.style.colorScheme = next;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode — the theme still applies for this visit */
    }
  }
  paintThemeControls();
}

document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(themeRoot.getAttribute("data-theme") === "light" ? "dark" : "light");
  });
});

window.addEventListener("storage", (event) => {
  if (event.key !== THEME_KEY) return;
  if (event.newValue === "light" || event.newValue === "dark") {
    applyTheme(event.newValue, false);
  }
});

paintThemeControls();

async function api(path) {
  if (cache[path]) return cache[path];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  const data = await res.json();
  cache[path] = data;
  return data;
}

// ---------- progress (localStorage; no accounts) ----------
const doneKey = (slug) => `cm_done_${slug}`;
const learnKey = (slug) => `cm_learn_${slug}`;

function getDone(slug) { return new Set(JSON.parse(localStorage.getItem(doneKey(slug)) || "[]")); }
function setDone(slug, set) { localStorage.setItem(doneKey(slug), JSON.stringify([...set])); }
function getLearn(slug) { return JSON.parse(localStorage.getItem(learnKey(slug)) || "{}"); }
function setLearn(slug, obj) { localStorage.setItem(learnKey(slug), JSON.stringify(obj)); }

// ---------- router ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  const parts = path.split("/").filter(Boolean);
  return { parts, params, path };
}

let currentNav = "";
function setActiveNav(name) {
  if (currentNav === name) return;
  currentNav = name;
  document.querySelectorAll(".main-nav a").forEach((a) =>
    a.classList.toggle("active", a.dataset.nav === name));
}

function closeSidebar() {
  const sb = document.getElementById("sidebar");
  const bk = document.getElementById("sidebar-backdrop");
  if (!sb) return;
  sb.classList.remove("open");
  bk.classList.remove("show");
  setTimeout(() => { bk.hidden = true; }, 200);
}

async function route() {
  // any navigation closes the topic drawer + sidebar instantly
  drawer.classList.remove("open");
  backdrop.classList.remove("show");
  drawer.hidden = true;
  backdrop.hidden = true;
  closeSidebar();
  // full chrome (header/footer) only on the homepage; everywhere else is full-bleed
  const isHome = parseHash().parts.length === 0;
  document.body.classList.toggle("chrome-full", isHome);
  document.body.classList.toggle("chrome-min", !isHome);
  const { parts, params } = parseHash();
  try {
    if (parts.length === 0) return await viewHome(params);
    if (parts[0] === "explorer") { setActiveNav("explorer"); return await viewTree(params); }
    if (parts[0] === "roadmap" && parts[1]) return await viewRoadmap(parts[1], params);
    if (parts[0] === "careers") return await viewCareers(params);
    if (parts[0] === "fields") return await viewFields(params);
    if (parts[0] === "about") return viewAbout(params);
    return await viewHome(params);
  } catch (e) {
    $app.innerHTML = `<div class="container"><div class="page-head"><h1>Something went wrong</h1>
      <p class="lead">${esc(e.message)}</p><p><a href="#/">← Back to all roadmaps</a></p></div></div>`;
  }
}
window.addEventListener("hashchange", route);

// ---------- home ----------
let activeFilter = "All";

async function viewHome() {
  setActiveNav("home");
  const { roadmaps } = await api("api/roadmaps.json");
  const categories = ["All", ...new Set(roadmaps.map((r) => r.category))];
  const totalTopics = roadmaps.reduce((s, r) => s + r.nodeCount, 0);
  document.title = "CareerMap — Step-by-step career roadmaps for non-tech fields";

  $app.innerHTML = `
    <div class="container">
      <div class="hero">
        <h1>Career roadmaps for <em>non-tech</em> fields.</h1>
        <p>Step-by-step, verified guides to becoming an accountant, marketer, nurse, teacher, lawyer and more — built like developer roadmaps, but for the rest of the job market. Free, no account needed.</p>
        <div class="stats-row">
          <span class="stat"><b>${roadmaps.length}</b> career roadmaps</span>
          <span class="stat"><b>${totalTopics}</b> guided topics</span>
          <span class="stat"><b>140+</b> O*NET-aligned roles</span>
          <span class="stat"><b>0</b> logins required</span>
        </div>
      </div>
      <div class="filter-row" id="filter-row">
        ${categories.map((c) => `<button class="filter-btn${c === activeFilter ? " active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
      </div>
      <div class="roadmap-grid" id="rm-grid"></div>
    </div>`;

  const grid = document.getElementById("rm-grid");
  grid.addEventListener("click", (e) => {
    const chip = e.target.closest(".deep-chip");
    if (chip) {
      e.preventDefault();
      e.stopPropagation();
      location.hash = `#/roadmap/${chip.dataset.slug}`;
    }
  });
  document.getElementById("filter-row").addEventListener("click", (e) => {
    const b = e.target.closest(".filter-btn");
    if (!b) return;
    activeFilter = b.dataset.cat;
    document.querySelectorAll(".filter-btn").forEach((x) => x.classList.toggle("active", x.dataset.cat === activeFilter));
    paint();
  });

  const childrenOf = (slug) => roadmaps.filter((r) => r.parent === slug);
  const mains = roadmaps.filter((r) => !r.parent);

  function paint() {
    const base = mains.length ? mains : roadmaps;
    const list = base.filter((r) => activeFilter === "All" || r.category === activeFilter);
    grid.innerHTML = list.map((r) => {
      const done = getDone(r.slug).size;
      const pct = r.nodeCount ? Math.round(100 * done / r.nodeCount) : 0;
      return `
      <a class="rm-card" href="#/roadmap/${esc(r.slug)}">
        <div class="rm-accent" style="background:${esc(r.color)}"></div>
        <div class="rm-body">
          <h3>${icon(r.icon, "card-icon")} ${esc(r.title)}</h3>
          <p>${esc(r.tagline)}</p>
          <div class="rm-meta">
            <span class="chip"><span class="dot" style="background:${esc(r.color)}"></span>${esc(r.category)}</span>
            <span>${r.nodeCount} topics</span>
            <span class="rm-progress" data-slug="${esc(r.slug)}" ${done > 0 ? "" : "hidden"}>
              ${done > 0 ? `<span>${pct}%</span><span class="bar"><i style="width:${pct}%"></i></span>` : ""}
            </span>
          </div>
          ${childrenOf(r.slug).length ? `<div class="deep-chips">
            ${childrenOf(r.slug).map((c) => `<span class="chip deep-chip" data-slug="${esc(c.slug)}">↳ ${esc(c.title)}</span>`).join("")}</div>` : ""}
        </div>
      </a>`;
    }).join("");
  }
  paint();
}

// ---------- roadmap page ----------
async function viewRoadmap(slug, params) {
  setActiveNav("roadmaps");
  const data = await api(`api/roadmaps/${slug}.json`);
  document.title = `${data.title} — CareerMap`;
  const nodes = data.items.filter((i) => i.type === "node");
  const done = getDone(slug);
  currentRoadmap = { data, nodes };

  // parent / niche relationships
  const { roadmaps: allRoadmaps } = await api("api/roadmaps.json");
  const parentInfo = data.parent ? allRoadmaps.find((r) => r.slug === data.parent) : null;
  const children = allRoadmaps.filter((r) => r.parent === data.slug);

  $app.innerHTML = `
    <div class="rm-page">
      <div id="stage" class="tree-fullbleed"></div>
      <div class="rm-floats">
        <div class="rm-topbar">
          <div class="rm-panel rm-title-block">
            <div class="rm-crumb">
              <a href="#/">← All roadmaps</a>
              ${parentInfo ? ` · part of <a href="#/roadmap/${esc(parentInfo.slug)}">${esc(parentInfo.title)}</a>` : ""}
            </div>
            <h1>${icon(data.icon, "card-icon")} ${esc(data.title)}</h1>
            <span class="progress-pill"><span id="prog-label">${done.size} / ${nodes.length} topics</span>
              <span class="bar"><i id="prog-bar" style="width:${nodes.length ? Math.round(100 * done.size / nodes.length) : 0}%"></i></span></span>
          </div>
          <div class="rm-panel rm-tools">
            <button class="btn danger" id="reset-progress">Reset</button>
            <details class="sources">
              <summary>Sources</summary>
              <ul>${data.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul>
            </details>
          </div>
        </div>
        ${children.length ? `<div class="rm-deep rm-panel"><span class="chip">Deeper paths</span>
          ${children.map((c) => `<a class="chip deep-chip" href="#/roadmap/${esc(c.slug)}">↳ ${esc(c.title)}</a>`).join("")}</div>` : ""}
        <div class="rm-hint">click a node for details · scroll to zoom · drag to pan</div>
      </div>
    </div>`;

  drawCurrent();

  document.getElementById("reset-progress").onclick = () => {
    localStorage.removeItem(doneKey(slug));
    localStorage.removeItem(learnKey(slug));
    closeDrawer();
    drawCurrent();
  };

  // deep link: #/roadmap/slug?node=ID
  const target = params.get("node");
  if (target) {
    const n = nodes.find((x) => x.id === target);
    if (n) openDrawer(data, n);
  }
}

let currentRoadmap = { data: null, nodes: [] };
let refreshRoadmapView = null;

function drawCurrent() {
  if (!currentRoadmap.data) return;
  const data = currentRoadmap.data;
  const nodes = currentRoadmap.nodes;
  const done = getDone(data.slug);
  const stage = document.getElementById("stage");
  if (!stage) return;
  stage.innerHTML = "";
  mountRoadmapTree(stage, data, { doneSet: done, onNodeClick: (n) => openDrawer(data, n) });
  updateProgressUI(data, nodes);
  refreshRoadmapView = drawCurrent;
}

function updateProgressUI(data, nodes) {
  const done = getDone(data.slug);
  const label = document.getElementById("prog-label");
  const bar = document.getElementById("prog-bar");
  if (label) label.textContent = `${done.size} / ${nodes.length} topics`;
  if (bar) bar.style.width = `${nodes.length ? Math.round(100 * done.size / nodes.length) : 0}%`;
}

// ---------- drawer ----------
const drawer = document.getElementById("drawer");
const backdrop = document.getElementById("drawer-backdrop");

function openDrawer(data, node) {
  const d = node.detail || {};
  const learn = getLearn(data.slug);
  const doneLearn = new Set(learn[node.id] || []);
  const done = getDone(data.slug);
  const groups = data.items.filter((i) => i.type === "group");
  const g = groups.find((gr) =>
    node.x >= gr.x && node.x + node.w <= gr.x + gr.w && node.y >= gr.y && node.y + node.h <= gr.y + gr.h);

  drawer.innerHTML = `
    <button class="drawer-close" title="Close">✕</button>
    <div class="d-kicker">${esc(data.title)}${g ? " · " + esc(g.label.toLowerCase()) : ""}</div>
    <h2>${esc(node.label)}</h2>
    <button class="btn ${done.has(node.id) ? "primary" : ""} done-toggle" id="toggle-done">
      ${done.has(node.id) ? "✓ Completed — undo?" : "Mark as completed"}
    </button>
    ${d.description ? `<section><h3>What it is</h3><p>${esc(d.description)}</p></section>` : ""}
    ${d.why ? `<section><h3>Why it matters</h3><div class="why">${esc(d.why)}</div></section>` : ""}
    ${d.learn?.length ? `<section><h3>What to learn &amp; do</h3>
      <ul class="check-list" id="learn-list">
        ${d.learn.map((l, i) => `<li data-i="${i}" class="${doneLearn.has(i) ? "done" : ""}">
          <input type="checkbox" ${doneLearn.has(i) ? "checked" : ""}><span>${esc(l)}</span></li>`).join("")}
      </ul></section>` : ""}
    ${d.skills?.length ? `<section><h3>Skills involved</h3>
      <div class="skill-chips">${d.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
    ${d.certs?.length ? `<section><h3>Certifications</h3>
      ${d.certs.map((c) => `<div class="cert-row"><span class="c-name">${esc(c.name)}</span>
        <span class="c-issuer">${esc(c.issuer)}</span><div class="c-note">${esc(c.note)}</div></div>`).join("")}</section>` : ""}
    ${d.resources?.length ? `<section><h3>Resources</h3>
      ${d.resources.map((r) => `<div class="res-row"><span class="kind">${esc(r.kind)}</span>
        <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></div>`).join("")}</section>` : ""}
    ${d.tasks?.length ? `<section><h3>On the job</h3>
      <ul class="task-list">${d.tasks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>` : ""}
    ${d.roles?.length ? `<section><h3>Related occupations (O*NET)</h3>
      <div class="role-links">${d.roles.map((code) =>
        `<a href="https://www.onetonline.org/link/summary/${esc(code)}" target="_blank" rel="noopener">
          <span class="code">${esc(code)}</span>View on O*NET →</a>`).join("")}</div></section>` : ""}
  `;

  drawer.querySelector(".drawer-close").onclick = closeDrawer;
  drawer.querySelector("#toggle-done").onclick = () => {
    const s = getDone(data.slug);
    s.has(node.id) ? s.delete(node.id) : s.add(node.id);
    setDone(data.slug, s);
    if (refreshRoadmapView) refreshRoadmapView();
    openDrawer(data, node); // refresh state
  };

  const list = drawer.querySelector("#learn-list");
  if (list) list.addEventListener("change", (e) => {
    const li = e.target.closest("li");
    const i = Number(li.dataset.i);
    const store = getLearn(data.slug);
    const set = new Set(store[node.id] || []);
    e.target.checked ? set.add(i) : set.delete(i);
    store[node.id] = [...set];
    setLearn(data.slug, store);
    li.classList.toggle("done", e.target.checked);
  });

  drawer.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add("open");
    backdrop.classList.add("show");
  });
  drawer.scrollTop = 0;
}

function closeDrawer() {
  drawer.classList.remove("open");
  backdrop.classList.remove("show");
  setTimeout(() => { drawer.hidden = true; backdrop.hidden = true; }, 220);
}
backdrop.onclick = closeDrawer;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

// ---------- careers library ----------
let famFilter = "";
async function viewCareers() {
  setActiveNav("careers");
  const { families } = await api("api/careers.json");
  document.title = "Careers Library — CareerMap";
  const total = families.reduce((s, f) => s + f.roles.length, 0);

  $app.innerHTML = `
    <div class="container">
      <div class="page-head">
        <h1>Careers Library</h1>
        <p class="lead">${total} occupations across ${families.length} families, organized by the O*NET-SOC 2019 taxonomy
        (onetonline.org). IT &amp; engineering occupations are out of scope — those live on <a href="https://roadmap.sh" target="_blank" rel="noopener">roadmap.sh</a>.</p>
        <div style="margin-top:16px"><input id="role-search" type="search" placeholder="Filter occupations…"
          style="width:min(420px,100%);padding:9px 14px;background:var(--panel);border:1px solid var(--border);border-radius:9px;color:var(--text);font:inherit"></div>
      </div>
      <div id="families"></div>
    </div>`;

  const wrap = document.getElementById("families");
  const paint = (q = "") => {
    const ql = q.trim().toLowerCase();
    wrap.innerHTML = families.map((f, idx) => {
      const roles = f.roles.filter((r) =>
        !ql || r.title.toLowerCase().includes(ql) || r.summary.toLowerCase().includes(ql) || r.code.includes(ql));
      if (!roles.length) return "";
      return `<section class="fam-section">
        <h2><span class="fam-code">${esc(f.code)}</span> ${esc(f.name)} <span style="color:var(--faint);font-size:13px;font-weight:400">${roles.length}</span></h2>
        <div class="role-grid">
          ${roles.map((r) => `<div class="role-card">
            <span class="r-code">${esc(r.code)}</span>
            <span class="r-title">${esc(r.title)}</span>
            <span class="r-summary">${esc(r.summary)}</span>
            <a class="r-link" href="${esc(r.url)}" target="_blank" rel="noopener">View on O*NET →</a>
          </div>`).join("")}
        </div>
      </section>`;
    }).join("") || `<p style="color:var(--muted);padding:20px 0">No occupations match “${esc(q)}”.</p>`;
  };
  paint();
  document.getElementById("role-search").addEventListener("input", (e) => paint(e.target.value));
}

// ---------- fields (JEL) ----------
async function viewFields() {
  setActiveNav("fields");
  const [fields, rms] = await Promise.all([api("api/fields.json"), api("api/roadmaps.json")]);
  const rmBySlug = Object.fromEntries(rms.roadmaps.map((r) => [r.slug, r]));
  document.title = "Fields of Study — CareerMap";
  const subs = fields.codes.filter((c) => c.level === "sub");
  const tops = fields.codes.filter((c) => c.level === "top");

  $app.innerHTML = `
    <div class="container">
      <div class="page-head">
        <h1>Fields of Study (JEL)</h1>
        <p class="lead fields-intro">${esc(fields.meta.description)} Read the full classification at
          <a href="${esc(fields.meta.url)}" target="_blank" rel="noopener">${esc(fields.meta.source)}</a>.</p>
      </div>
      <div class="jel-grid">
        ${subs.map((c) => `<div class="jel-card">
          <span class="j-code">${esc(c.code)}</span>
          <h3>${esc(c.name)}</h3>
          ${c.related.length ? `<div class="j-links">${c.related.map((s) => rmBySlug[s] ? `
            <a class="chip" href="#/roadmap/${esc(s)}"><span class="dot" style="background:${esc(rmBySlug[s].color)}"></span>${esc(rmBySlug[s].title)}</a>` : "").join("")}</div>` : ""}
        </div>`).join("")}
      </div>
      <div class="page-head"><h2 style="font-size:22px">All JEL top-level categories</h2></div>
      <div class="jel-grid" style="padding-top:0">
        ${tops.map((c) => `<div class="jel-card" style="${c.careerRelevant ? "border-color:var(--border-strong)" : "opacity:.62"}">
          <span class="j-code" style="${c.careerRelevant ? "" : "background:var(--panel-2);color:var(--muted)"}">${esc(c.code)}</span>
          <h3 style="font-size:14px">${esc(c.name)}</h3>
          ${c.note ? `<div class="j-note">${esc(c.note)}</div>` : ""}
        </div>`).join("")}
      </div>
    </div>`;
}

// ---------- about ----------
function viewAbout() {
  setActiveNav("about");
  document.title = "About — CareerMap";
  $app.innerHTML = `
    <div class="container about-body">
      <div class="page-head">
        <h1>About CareerMap</h1>
        <p class="lead">Free, open, roadmap-style guides to non-tech careers — inspired by
        <a href="https://roadmap.sh" target="_blank" rel="noopener">roadmap.sh</a>, which does the same brilliantly for software roles.</p>
      </div>
      <h2>Why this exists</h2>
      <p>Almost every “career roadmap” project on the internet is about software. Yet most jobs are not in tech.
      CareerMap applies the roadmap.sh pattern — interactive, clickable learning graphs — to accounting, marketing,
      healthcare, trades, education, law and more.</p>
      <h2>Methodology &amp; sources</h2>
      <ul>
        <li><b>Occupations</b> are grounded in the <a href="https://www.onetonline.org/" target="_blank" rel="noopener">O*NET-SOC 2019</a>
        taxonomy (O*NET OnLine is sponsored by the U.S. Department of Labor; data is public, CC BY 4.0). Occupation codes link directly to O*NET summary pages.</li>
        <li><b>Fields of study</b> mapping uses the <a href="https://www.aeaweb.org/econlit/jelCodes" target="_blank" rel="noopener">JEL classification</a>
        maintained by the American Economic Association.</li>
        <li><b>Skill language</b> follows O*NET skill naming conventions and the naming style of the
        <a href="https://github.com/maudgrol/Data_driven_skills_taxonomy" target="_blank" rel="noopener">Data-driven skills taxonomy</a>.</li>
        <li><b>Certifications</b> are stated only where requirements are public and verifiable at the issuing body
        (e.g. PMI, NASBA/AICPA, SHRM, HRCI, ASCM, NCSBN, AHIMA, NALA, ETS). We deliberately exclude wage numbers; every roadmap links to the
        <a href="https://www.bls.gov/ooh/" target="_blank" rel="noopener">BLS Occupational Outlook Handbook</a> for current data.</li>
        <li><b>Resources</b> favor free, stable learning sources (Khan Academy, OpenStax, MIT OpenCourseWare, official certification-body pages).</li>
      </ul>
      <h2>Free, no account</h2>
      <p>There is no login. When you mark a topic complete, it is stored only in your browser's local storage.
      Clearing site data resets your progress.</p>
      <h2>Run it yourself</h2>
      <pre>python3 scripts/seed.py    # build data/roadmap.db from content/*.json
python3 server.py          # serve at http://127.0.0.1:8080</pre>
      <p>Zero dependencies beyond Python 3.8+. The SQLite database is rebuilt from the version-controlled JSON content,
      so the whole site is auditable and portable.</p>
    </div>`;
}

// ---------- global search (header + sidebar) ----------
function initSearch(inputEl, resultsEl) {
  if (!inputEl || !resultsEl) return;
  let timer = null;
  inputEl.addEventListener("input", () => {
    clearTimeout(timer);
    const q = inputEl.value.trim();
    if (q.length < 2) { resultsEl.hidden = true; resultsEl.innerHTML = ""; return; }
    timer = setTimeout(async () => {
      try {
        const r = (await (window.__cmIndex || (window.__cmIndex = fetch("api/search-index.json").then((x) => x.json()))))
            .then((ix) => ({
              roadmaps: ix.roadmaps.filter((m) => (m.title + " " + m.tagline + " " + (m.summary || "")).toLowerCase().includes(q.toLowerCase())).slice(0, 6)
                .map((m) => ({ slug: m.slug, title: m.title, tagline: m.tagline, category: m.category, color: m.color, icon: m.icon })),
              topics: ix.topics.filter((t) => t.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12),
              careers: ix.careers.filter((c) => (c.title + " " + (c.summary || "")).toLowerCase().includes(q.toLowerCase())).slice(0, 10),
            }));
        if ((inputEl.value || "").trim() !== q) return;
        const groups = [];
        if (r.roadmaps.length) groups.push(["Roadmaps", r.roadmaps.map((m) => `
          <a class="sr-item" href="#/roadmap/${esc(m.slug)}"><div class="sr-label">${esc(m.title)}</div>
          <div class="sr-sub">${esc(m.tagline)}</div></a>`).join("")]);
        if (r.topics.length) groups.push(["Topics", r.topics.map((t) => `
          <a class="sr-item" href="#/roadmap/${esc(t.slug)}?node=${encodeURIComponent(t.id)}">
          <div class="sr-label">${esc(t.label)}</div><div class="sr-sub">${esc(t.roadmap)}</div></a>`).join("")]);
        if (r.careers.length) groups.push(["Careers", r.careers.map((c) => `
          <a class="sr-item" href="#/careers"><div class="sr-label">${esc(c.title)}</div>
          <div class="sr-sub"><span style="font-family:ui-monospace;font-size:11px">${esc(c.code)}</span> · ${esc(c.family_name)}</div></a>`).join("")]);
        resultsEl.innerHTML = groups.length
          ? groups.map(([g, html]) => `<div class="sr-group">${g}</div>${html}`).join("")
          : `<div class="sr-empty">No results for “${esc(q)}”.</div>`;
        resultsEl.hidden = false;
      } catch { /* ignore */ }
    }, 180);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) { resultsEl.hidden = true; }
  });
  resultsEl.addEventListener("click", () => {
    resultsEl.hidden = true; inputEl.value = ""; closeSidebar();
  });
}
initSearch(document.getElementById("global-search"), document.getElementById("search-results"));
initSearch(document.getElementById("sidebar-search"), document.getElementById("sidebar-results"));

// ---------- hamburger sidebar ----------
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
function openSidebar() {
  sidebarBackdrop.hidden = false;
  requestAnimationFrame(() => { sidebar.classList.add("open"); sidebarBackdrop.classList.add("show"); });
}
document.getElementById("hamburger").addEventListener("click", openSidebar);
document.getElementById("sb-close").addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);
sidebar.addEventListener("click", (e) => { if (e.target.closest("a")) closeSidebar(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });

// ---------- boot ----------
route();
