// SVG roadmap renderer — draws nodes, groups, labels and auto-routed connector
// paths from roadmap data (see content/SPEC.md for the data contract).
import { GROUP_COLORS } from "./icons.js";

const NS = "http://www.w3.org/2000/svg";
const NODE_FILL = "#101114";
const NODE_STROKE = "#b9bec6";
const MUTED_STROKE = "#565c66";
const ACCENT_DEFAULT = "#f5c518";
const EDGE = "#7d838c";
const EDGE_DASH = "#565c66";
const DONE = "#3fb950";
const R = 8;          // node corner radius
const CR = 9;         // connector corner radius

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Approximate text width (system sans, 14.5px semibold ≈ 7.9px/char)
function wrapLabel(label, boxW) {
  const maxChars = Math.max(8, Math.floor((boxW - 22) / 7.9));
  if (label.length <= maxChars) return [label];
  const words = label.split(" ");
  if (words.length === 1) return [label];
  // balance two lines
  let best = null, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    if (a.length > maxChars + 2 || b.length > maxChars + 2) continue;
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  return best || [label];
}

// Orthogonal connector path between two rects, with rounded corners + arrowhead.
function routeEdge(a, b) {
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  const ovX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ovY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  let sx, sy, ex, ey, dir; // dir: 'v' | 'h'

  if (b.y >= a.y + a.h && ovX > 30) {
    // below
    sx = Math.min(Math.max(bcx, a.x + 12), a.x + a.w - 12);
    sy = a.y + a.h;
    ex = Math.min(Math.max(acx, b.x + 12), b.x + b.w - 12);
    ey = b.y; dir = "v";
  } else if (b.y + b.h <= a.y && ovX > 30) {
    // above
    sx = Math.min(Math.max(bcx, a.x + 12), a.x + a.w - 12);
    sy = a.y;
    ex = Math.min(Math.max(acx, b.x + 12), b.x + b.w - 12);
    ey = b.y + b.h; dir = "v";
  } else if (b.x >= a.x + a.w && ovY > 24) {
    // right
    sx = a.x + a.w; sy = Math.min(Math.max(bcy, a.y + 10), a.y + a.h - 10);
    ex = b.x; ey = Math.min(Math.max(acy, b.y + 10), b.y + b.h - 10); dir = "h";
  } else if (b.x + b.w <= a.x && ovY > 24) {
    // left
    sx = a.x; sy = Math.min(Math.max(bcy, a.y + 10), a.y + a.h - 10);
    ex = b.x + b.w; ey = Math.min(Math.max(acy, b.y + 10), b.y + b.h - 10); dir = "h";
  } else {
    // diagonal-ish fallback: elbow through mid point
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) {
      dir = "v";
      const my = (a.y + a.h + b.y) / 2;
      sx = acx; sy = b.y > a.y ? a.y + a.h : a.y;
      ex = bcx; ey = b.y > a.y ? b.y : b.y + b.h;
      return elbowV(sx, sy, ex, ey, my);
    }
    dir = "h";
    const mx = (a.x + a.w + b.x) / 2;
    sx = acx; sy = a.y + a.h; ex = bcx; ey = b.y;
    return elbowH(sx, sy, ex, ey, mx);
  }

  if (dir === "v") {
    if (Math.abs(sx - ex) < 2) return `M ${sx} ${sy} L ${ex} ${ey}`;
    const my = (sy + ey) / 2;
    return elbowV(sx, sy, ex, ey, my);
  }
  if (Math.abs(sy - ey) < 2) return `M ${sx} ${sy} L ${ex} ${ey}`;
  const mx = (sx + ex) / 2;
  return elbowH(sx, sy, ex, ey, mx);
}

function elbowV(sx, sy, ex, ey, my) {
  const r = Math.min(CR, Math.abs(my - sy) / 2, Math.abs(ey - my) / 2, Math.abs(ex - sx) / 2);
  const d1 = sy < my ? 1 : -1, d2 = ey > my ? 1 : -1;
  return [
    `M ${sx} ${sy}`,
    `L ${sx} ${my - d1 * r}`,
    `Q ${sx} ${my} ${sx + (ex > sx ? r : -r)} ${my}`,
    `L ${ex + (ex > sx ? -r : r)} ${my}`,
    `Q ${ex} ${my} ${ex} ${my + d2 * r}`,
    `L ${ex} ${ey}`,
  ].join(" ");
}

function elbowH(sx, sy, ex, ey, mx) {
  const r = Math.min(CR, Math.abs(mx - sx) / 2, Math.abs(ex - mx) / 2, Math.abs(ey - sy) / 2);
  const d1 = sx < mx ? 1 : -1, d2 = ex > mx ? 1 : -1;
  return [
    `M ${sx} ${sy}`,
    `L ${mx - d1 * r} ${sy}`,
    `Q ${mx} ${sy} ${mx} ${sy + (ey > sy ? r : -r)}`,
    `L ${mx} ${ey + (ey > sy ? -r : r)}`,
    `Q ${mx} ${ey} ${mx + d2 * r} ${ey}`,
    `L ${ex} ${ey}`,
  ].join(" ");
}

function nodeText(n, thumbnail) {
  const lines = wrapLabel(n.label, n.w);
  const fs = thumbnail ? 14 : 14.5;
  const lh = fs * 1.25;
  const cy = n.y + n.h / 2;
  const start = cy - ((lines.length - 1) * lh) / 2 + fs * 0.32;
  return lines.map((ln, i) =>
    `<text x="${n.x + n.w / 2}" y="${start + i * lh}" text-anchor="middle" font-size="${fs}">${esc(ln)}</text>`
  ).join("");
}

/**
 * Build the full SVG string for a roadmap.
 * opts: { thumbnail: bool, doneSet: Set<string>, onNodeClick: fn(node), onHoverEdge: bool }
 */
export function renderRoadmapSVG(data, opts = {}) {
  const { thumbnail = false, doneSet = null, onNodeClick = null, highlightEdges = true } = opts;
  const nodes = data.items.filter((i) => i.type === "node");
  const groups = data.items.filter((i) => i.type === "group");
  const labels = data.items.filter((i) => i.type === "label");
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const accent = data.color || ACCENT_DEFAULT;

  const W = 1440;
  let maxY = 400;
  for (const i of data.items) maxY = Math.max(maxY, (i.y || 0) + (i.h || 40));
  const H = maxY + 50;

  const arrowId = thumbnail ? "arr-t" : "arr";
  let defs = `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${EDGE}"/></marker></defs>`;

  // edges (under everything)
  let edgesSvg = "";
  data.edges.forEach((e, idx) => {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return;
    const d = routeEdge(a, b);
    edgesSvg += `<path class="edge${e.dashed ? " dashed" : ""}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="${d}" marker-end="url(#${arrowId})"/>`;
  });

  // groups
  let groupsSvg = "";
  groups.forEach((g, idx) => {
    const color = GROUP_COLORS[idx % GROUP_COLORS.length];
    groupsSvg += `<g class="g-group">
      <rect class="frame" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" stroke="${color}"/>
      <text class="glabel" x="${g.x + 26}" y="${g.y + 44}" fill="${color}">${esc(g.label)}</text>
    </g>`;
  });

  // labels
  let labelsSvg = "";
  labels.forEach((l) => {
    const lines = wrapLabel(l.label, l.w || 200);
    labelsSvg += `<g class="g-label">${lines.map((ln, i) =>
      `<text x="${l.x}" y="${l.y + i * 19}">${esc(ln)}</text>`).join("")}</g>`;
  });

  // nodes (top)
  let nodesSvg = "";
  for (const n of nodes) {
    const isDone = doneSet && doneSet.has(n.id);
    const stroke = n.variant === "accent" ? accent : n.variant === "muted" ? MUTED_STROKE : NODE_STROKE;
    nodesSvg += `<g class="g-node ${n.variant || ""}${isDone ? " done" : ""}" data-id="${esc(n.id)}"
      style="--node-accent:${accent}" ${thumbnail ? 'pointer-events="none"' : 'tabindex="0" role="button" aria-label="' + esc(n.label) + '"'}>
      <rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${R}" stroke="${stroke}"/>
      ${nodeText(n, thumbnail)}
      <g class="done-badge" transform="translate(${n.x + n.w - 2},${n.y + 2})">
        <circle r="10" fill="${DONE}"/>
        <path d="M -4.5 0 L -1.5 3.2 L 4.5 -3" stroke="#0d0e10" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>`;
  }

  const svgOpen = `<svg class="roadmap" viewBox="0 0 ${W} ${H}" xmlns="${NS}" data-thumb="${thumbnail ? 1 : 0}">`;
  const svg = `${svgOpen}${defs}${edgesSvg}${groupsSvg}${labelsSvg}${nodesSvg}</svg>`;
  return { svg, W, H };
}

/**
 * Mount an already-rendered SVG string into a container and attach interactions.
 */
export function mountRoadmap(container, data, opts = {}) {
  const { doneSet = null, onNodeClick = null } = opts;
  const { svg } = renderRoadmapSVG(data, { doneSet, thumbnail: false });
  container.innerHTML = svg;
  const svgEl = container.querySelector("svg");

  const nodes = data.items.filter((i) => i.type === "node");
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const clickHandler = (e) => {
    const g = e.target.closest(".g-node");
    if (g && onNodeClick) onNodeClick(byId[g.dataset.id], g);
  };
  const keyHandler = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const g = e.target.closest(".g-node");
    if (g && onNodeClick) { e.preventDefault(); onNodeClick(byId[g.dataset.id], g); }
  };
  const hoverHandler = (e) => {
    const g = e.target.closest(".g-node");
    svgEl.querySelectorAll(".edge").forEach((p) => p.classList.remove("hl"));
    if (!g) return;
    svgEl.querySelectorAll(`.edge[data-from="${CSS.escape(g.dataset.id)}"],.edge[data-to="${CSS.escape(g.dataset.id)}"]`)
      .forEach((p) => p.classList.add("hl"));
  };
  svgEl.addEventListener("click", clickHandler);
  svgEl.addEventListener("keydown", keyHandler);
  svgEl.addEventListener("mouseover", hoverHandler);
  svgEl.addEventListener("mouseleave", hoverHandler);
  return svgEl;
}

export { esc, wrapLabel };
