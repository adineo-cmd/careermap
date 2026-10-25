// Explorer — OSINT Framework-style collapsible radial tree (D3.js v7).
// Root → field branches → roadmaps/stages/topics + O*NET occupations + JEL codes.
// Two levels visible initially; click to expand; pinch/scroll zoom; touch-friendly.

function shorten(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function viewTree() {
  document.title = "Explorer — CareerMap";
  const $app = document.getElementById("app");
  $app.innerHTML = `
    <div class="explorer-wrap">
      <div class="explorer-head">
        <h1>Explorer</h1>
        <p class="lead">Every non-tech field in one tree — roadmaps, O*NET occupations, and fields of study.
        Click a circle to expand or collapse; click a topic or occupation name to open it. Pinch or scroll to zoom, drag to pan.</p>
        <div class="explorer-actions">
          <button class="btn" id="tree-expand">Expand all</button>
          <button class="btn" id="tree-collapse">Collapse all</button>
          <button class="btn" id="tree-fit">Fit</button>
        </div>
      </div>
      <div class="tree-stage" id="tree-stage">
        <div class="tree-hint">Click circles to explore · drag to pan · scroll / pinch to zoom</div>
      </div>
    </div>`;

  const [rms, careers, fields] = await Promise.all([
    fetch("/api/roadmaps").then((r) => r.json()),
    fetch("/api/careers").then((r) => r.json()),
    fetch("/api/fields").then((r) => r.json()),
  ]);

  // ---------- hierarchy ----------
  const rootData = {
    name: "CareerMap",
    kind: "root",
    children: [
      {
        name: `Career Roadmaps (${rms.roadmaps.length})`,
        kind: "roadmaps",
        children: rms.roadmaps.map((r) => ({
          name: r.title, kind: "roadmap", slug: r.slug, color: r.color,
          childrenLoaded: false, children: undefined,
        })),
      },
      {
        name: "Occupations · O*NET",
        kind: "occupations",
        children: careers.families.map((f) => ({
          name: `${f.name} (${f.roles.length})`,
          kind: "family",
          children: f.roles.map((r) => ({
            name: r.title, kind: "occupation", url: r.url, code: r.code,
          })),
        })),
      },
      {
        name: "Fields of Study · JEL",
        kind: "fields",
        children: fields.codes.filter((c) => c.level === "top").map((cat) => {
          const subs = fields.codes.filter((c) => c.level === "sub" && c.code[0] === cat.code);
          return {
            name: cat.name, kind: "jelcat", careerRelevant: !!cat.careerRelevant,
            children: subs.length ? subs.map((c) => ({
              name: c.code, kind: "jel", detail: c.name, related: c.related,
            })) : undefined,
          };
        }),
      },
    ],
  };

  // roadmap stage groups/topics are filled lazily from the detail API
  const detailCache = {};
  async function fillRoadmapChildren(node) {
    if (!detailCache[node.slug]) {
      detailCache[node.slug] = fetch(`/api/roadmaps/${node.slug}`).then((r) => r.json());
    }
    const detail = await detailCache[node.slug];
    const groups = detail.items.filter((i) => i.type === "group");
    node.children = [];
    // niche (deeper-path) roadmaps nest under their parent
    const niches = rms.roadmaps.filter((r) => r.parent === node.slug);
    if (niches.length) {
      node.children.push({
        name: "Deeper paths",
        kind: "stage",
        children: niches.map((nr) => ({
          name: nr.title, kind: "roadmap", slug: nr.slug, color: nr.color,
          childrenLoaded: false, children: undefined,
        })),
      });
    }
    const stages = groups.map((g) => ({
      name: titleCase(g.label),
      kind: "stage",
      children: detail.items.filter((i) =>
        i.type === "node" &&
        i.x >= g.x && i.x + i.w <= g.x + g.w &&
        i.y >= g.y && i.y + i.h <= g.y + g.h
      ).map((n) => ({ name: n.label, kind: "topic", slug: node.slug, nodeId: n.id })),
    }));
    if (!groups.length) {
      const loose = detail.items.filter((i) => i.type === "node")
        .map((n) => ({ name: n.label, kind: "topic", slug: node.slug, nodeId: n.id }));
      node.children = node.children.concat(loose);
    } else {
      node.children = node.children.concat(stages);
    }
  }

  // ---------- D3 ----------
  const stage = document.getElementById("tree-stage");
  const width = stage.clientWidth || window.innerWidth;
  const height = Math.max(560, Math.min(920, window.innerHeight - 200));

  const svg = d3.select(stage).append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", "100%")
    .attr("height", height);

  const g = svg.append("g");
  const gLink = g.append("g").attr("class", "tree-links");
  const gNode = g.append("g").attr("class", "tree-nodes");

  const zoomBehavior = d3.zoom().scaleExtent([0.2, 4])
    .on("zoom", (event) => g.attr("transform", event.transform));
  svg.call(zoomBehavior);

  const root = d3.hierarchy(rootData);
  root.x0 = 0; root.y0 = 0;
  let idSeq = 0;

  // start with 2 levels visible; deeper levels stored in _children
  root.children.forEach((branch) => {
    branch.children?.forEach((c) => {
      if (c.children) { c._children = c.children; c.children = null; }
    });
  });

  const treeLayout = d3.tree().nodeSize([26, 200]);
  const diagonal = d3.linkHorizontal().x((d) => d.y).y((d) => d.x);
  const duration = 320;
  let firstRender = true;

  // root points right (OSINT style), labels read outward
  const pos = (d) => `translate(${d.y},${d.x})`;

  function update(source) {
    treeLayout(root);
    const nodes = root.descendants();
    const links = root.links();
    const t = firstRender ? 0 : duration;

    const link = gLink.selectAll("path.tree-link").data(links, (d) => d.target.id);
    link.enter().append("path").attr("class", "tree-link")
      .merge(link)
      .transition().duration(t).attr("d", diagonal);
    link.exit().transition().duration(t).attr("d", diagonal).remove();

    const node = gNode.selectAll("g.tree-node").data(nodes, (d) => d.id);
    const nodeEnter = node.enter().append("g")
      .attr("class", "tree-node")
      .attr("transform", firstRender ? pos : pos(source))
      .attr("opacity", firstRender ? 1 : 0)
      .on("click", (event, d) => clickNode(d));

    nodeEnter.append("circle")
      .attr("r", (d) => (d.data.kind === "root" ? 9 : 5.5))
      .attr("class", (d) => `tn-circle tn-${d.data.kind}`);

    nodeEnter.append("text")
      .attr("dy", "0.32em")
      .attr("class", (d) => `tn-label tn-l${Math.min(d.depth, 4)}`)
      .attr("x", (d) => (d.data.kind === "root" ? -14 : 12))
      .attr("text-anchor", (d) => (d.data.kind === "root" ? "end" : "start"))
      .text((d) => (d.data.kind === "jel" ? `${d.data.name} — ${shorten(d.data.detail, 42)}` : d.data.name));

    nodeEnter.merge(node).transition().duration(t)
      .attr("transform", pos)
      .attr("opacity", 1);
    nodeEnter.merge(node).select("circle")
      .attr("class", (d) => `tn-circle tn-${d.data.kind}${(d._children || d.children) ? "" : " tn-leaf"}`);

    node.exit().transition().duration(t)
      .attr("transform", pos(source))
      .attr("opacity", 0).remove();

    nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
    firstRender = false;
  }

  function hydrate(node, parent, depth) {
    node.parent = parent;
    node.depth = depth;
    node.id = node.id || "h" + (idSeq++);
    (node.children || []).forEach((c) => hydrate(c, node, depth + 1));
  }

  async function clickNode(d) {
    if (d.data.kind === "topic" && d.data.slug) {
      location.hash = `#/roadmap/${d.data.slug}?node=${encodeURIComponent(d.data.nodeId)}`;
      return;
    }
    if (d.data.kind === "occupation" && d.data.url) {
      window.open(d.data.url, "_blank", "noopener");
      return;
    }
    if (d.data.kind === "roadmap" && !d.data.childrenLoaded) {
      await fillRoadmapChildren(d.data);
      d.data.childrenLoaded = true;
      (d.data.children || []).forEach((c) => hydrate(c, d, d.depth + 1));
    }
    if (d.children) {
      d._children = d.children; d.children = null;
    } else if (d.data.children && d.data.children.length) {
      d.children = d.data.children; d._children = null;
      d.data.children = null;
    } else if (d._children) {
      d.children = d._children; d._children = null;
    } else {
      return;
    }
    update(d);
  }

  function fit() {
    requestAnimationFrame(() => {
      try {
        const bounds = g.node().getBBox();
        if (!bounds.width || !bounds.height) return;
        const pad = 90;
        const sx = Math.min(width / (bounds.width + pad * 2), height / (bounds.height + pad * 2), 1.3);
        const tx = width / 2 - sx * (bounds.x + bounds.width / 2);
        const ty = height / 2 - sx * (bounds.y + bounds.height / 2);
        svg.transition().duration(450)
          .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(sx));
      } catch { /* bbox not ready */ }
    });
  }

  document.getElementById("tree-collapse").onclick = () => {
    root.descendants().forEach((d) => {
      if (d.depth >= 2 && d.children) { d._children = d.children; d.children = null; }
    });
    update(root);
    fit();
  };

  document.getElementById("tree-expand").onclick = async () => {
    const pending = [];
    for (const d of root.descendants()) {
      if (d.data.kind === "roadmap" && !d.data.childrenLoaded) pending.push(d);
      else if (d._children) { d.children = d._children; d._children = null; }
    }
    for (const d of pending) {
      await fillRoadmapChildren(d.data);
      d.data.childrenLoaded = true;
      (d.data.children || []).forEach((c) => hydrate(c, d, d.depth + 1));
      d.children = d.data.children; d.data.children = null;
    }
    update(root);
    fit();
  };

  document.getElementById("tree-fit").onclick = fit;

  update(root);
  fit();
}

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/(^|[\s&-])\w/g, (m) => m.toUpperCase());
}
