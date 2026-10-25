// Radial collapsible D3 tree for individual roadmap pages (OSINT Framework pattern).
// Root = roadmap title → stage groups → topic nodes. Clicking a topic opens the
// notes drawer; clicking a stage/root toggles collapse. Zoom/pan, touch-friendly.

import { GROUP_COLORS } from "./icons.js";

export function mountRoadmapTree(container, data, opts = {}) {
  const { doneSet = new Set(), onNodeClick = () => {} } = opts;

  // ---------- build hierarchy ----------
  const groups = data.items.filter((i) => i.type === "group");
  const nodes = data.items.filter((i) => i.type === "node");
  const inGroup = (n, g) =>
    n.x >= g.x && n.x + n.w <= g.x + g.w && n.y >= g.y && n.y + n.h <= g.y + g.h;

  const rootData = {
    name: data.title,
    kind: "root",
    color: data.color || "#f5c518",
    children: [],
  };
  const grouped = new Set();
  groups.forEach((g, i) => {
    const members = nodes.filter((n) => inGroup(n, g));
    members.forEach((m) => grouped.add(m.id));
    if (!members.length) return;
    rootData.children.push({
      name: titleCase(g.label),
      kind: "stage",
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      children: members.map((n) => mkTopic(n)),
    });
  });
  const loose = nodes.filter((n) => !grouped.has(n.id));
  if (loose.length) {
    rootData.children.push({
      name: "Topics",
      kind: "stage",
      color: GROUP_COLORS[0],
      children: loose.map((n) => mkTopic(n)),
    });
  }
  function mkTopic(n) {
    return { item: n, name: n.label, kind: "topic", done: doneSet.has(n.id) };
  }

  // ---------- D3 ----------
  container.innerHTML = "";
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const svg = d3.select(container).append("svg")
    .attr("class", "roadmap-tree-svg")
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
  root.each((d) => { d.id = d.id || "t" + (idSeq++); });

  const treeLayout = d3.tree().nodeSize([30, 190]);
  const diagonal = d3.linkHorizontal().x((d) => d.y).y((d) => d.x);
  const pos = (d) => `translate(${d.y},${d.x})`;

  function update(source) {
    treeLayout(root);
    const nodesNow = root.descendants();
    const links = root.links();

    const link = gLink.selectAll("path.tree-link").data(links, (d) => d.target.id);
    link.enter().append("path").attr("class", "tree-link")
      .merge(link).transition().duration(280).attr("d", diagonal);
    link.exit().transition().duration(280).attr("d", diagonal).remove();

    const node = gNode.selectAll("g.tree-node").data(nodesNow, (d) => d.id);
    const nodeEnter = node.enter().append("g")
      .attr("class", "tree-node")
      .attr("transform", pos(source))
      .attr("opacity", 0)
      .on("click", (event, d) => clickNode(d));

    nodeEnter.append("circle")
      .attr("r", (d) => (d.data.kind === "root" ? 10 : d.data.kind === "stage" ? 7 : 5))
      .attr("class", (d) => `tn-circle tn-${d.data.kind}${d.data.done ? " tn-done" : ""}`)
      .style("fill", (d) =>
        d.data.kind === "root" ? (d.data.color || "#f5c518")
        : d.data.kind === "stage" ? (d.data.color || "#5d6cc0")
        : d.data.done ? "#3fb950" : "#8ab4ff");

    nodeEnter.append("text")
      .attr("dy", "0.32em")
      .attr("class", (d) => `tn-label tn-l${Math.min(d.depth, 4)}${d.data.kind === "topic" && d.data.done ? " tn-done-text" : ""}`)
      .attr("x", (d) => (d.data.kind === "root" ? -14 : 12))
      .attr("text-anchor", (d) => (d.data.kind === "root" ? "end" : "start"))
      .text((d) => d.data.name);

    nodeEnter.merge(node).transition().duration(280)
      .attr("transform", pos).attr("opacity", 1);
    node.exit().transition().duration(280)
      .attr("transform", pos(source)).attr("opacity", 0).remove();

    nodesNow.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
  }

  function clickNode(d) {
    if (d.data.kind === "topic" && d.data.item) {
      onNodeClick(d.data.item);
      return;
    }
    if (d.children) { d._children = d.children; d.children = null; }
    else if (d._children) { d.children = d._children; d._children = null; }
    update(d);
  }

  // start fully expanded (stages + topics), like an open roadmap
  update(root);

  // fit-to-screen
  function fit() {
    requestAnimationFrame(() => {
      try {
        const bounds = g.node().getBBox();
        if (!bounds.width || !bounds.height) return;
        const pad = 110;
        const sx = Math.min(width / (bounds.width + pad * 2), height / (bounds.height + pad * 2), 1.35);
        const tx = width / 2 - sx * (bounds.x + bounds.width / 2);
        const ty = height / 2 - sx * (bounds.y + bounds.height / 2);
        svg.transition().duration(450)
          .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(sx));
      } catch { /* not ready */ }
    });
  }
  fit();
  setTimeout(fit, 120);

  return { fit };
}

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/(^|[\s&-])\w/g, (m) => m.toUpperCase());
}
