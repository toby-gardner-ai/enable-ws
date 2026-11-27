// The interactive 3D control graph: one instance per [data-control-graph] element.
// Loaded only when a graph scrolls into view (see ControlGraph.astro).
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { SHELL, disposeGuides, linkDistance, shellForce, shellGuides } from './shells';

type Node = { id: string; type: string; title: string; kind?: string; level?: string; href: string | null; x?: number; y?: number; z?: number };
type Link = { source: string | Node; target: string | Node; type: string };
type Data = { nodes: Node[]; links: Link[] };
export type Focus = { types: string[] | null; links?: string[] };

const TYPE_LABEL: Record<string, string> = {
  control_policy: 'Policy',
  governance_subject: 'Governance subject',
  control: 'Control',
  asset_class: 'Asset',
  risk: 'Risk',
};
const SHELL_LABEL: Record<string, string> = {
  control_policy: 'Policies',
  governance_subject: 'Governance subjects',
  control: 'Controls',
  asset_class: 'Assets',
  risk: 'Risks',
};
const LEVEL_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const SIZE: Record<string, number> = { control_policy: 6, asset_class: 4, governance_subject: 1.6, control: 1.6 };
const RELSIZE = 3.2;
const MAX_MINI = 12; // boxes shown for a hovered node's neighbours

let dataPromise: Promise<Data> | null = null;
const loadData = () => (dataPromise ??= fetch('/governance/graph.json').then((r) => r.json()));

const hexToRgba = (hex: string, a: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const endId = (end: string | Node) => (typeof end === 'string' ? end : end.id);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function mountGraph(root: HTMLElement) {
  const el = root.querySelector<HTMLElement>('.cg-canvas')!;
  const stage = root.querySelector<HTMLElement>('.cg-stage')!;
  const status = root.querySelector<HTMLElement>('.cg-status')!;
  const tip = root.querySelector<HTMLElement>('.cg-tip')!;
  const mini = root.querySelector<HTMLElement>('.cg-mini')!;
  const tap = root.querySelector<HTMLButtonElement>('.cg-tap')!;
  const keys = [...root.querySelectorAll<HTMLButtonElement>('.cg-key')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(hover: none)').matches;
  const layers = new Set((root.dataset.layers ?? 'asset_class,control_policy,governance_subject,control,risk').split(','));

  const all = await loadData();
  const nodes = all.nodes.filter((n) => layers.has(n.type)).map((n) => ({ ...n }));
  const kept = new Set(nodes.map((n) => n.id));
  const links = all.links.filter((l) => kept.has(endId(l.source)) && kept.has(endId(l.target))).map((l) => ({ ...l }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const types = new Map(nodes.map((n) => [n.id, n.type]));
  const typeOf = (end: string | Node) => types.get(endId(end))!;
  const neighbours = new Map<string, Set<string>>();
  for (const l of links) {
    const s = endId(l.source), t = endId(l.target);
    (neighbours.get(s) ?? neighbours.set(s, new Set()).get(s)!).add(t);
    (neighbours.get(t) ?? neighbours.set(t, new Set()).get(t)!).add(s);
  }
  const counts: Record<string, number> = {};
  for (const n of nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;

  const visible = new Set(layers);
  let hovered: Node | null = null;
  let locked = root.hasAttribute('data-locked'); // see `cg:lock` below
  let focus: Set<string> | null = null;
  let focusLinks = new Set<string>();

  // Colours come from the element, so a section can give the graph its own (dark) stage.
  const css = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  let palette: Record<string, string> = {};
  const readPalette = () => {
    palette = {
      bg: css('--bg'),
      control_policy: css('--text'),
      governance_subject: css('--g-subject'),
      control: css('--g-control'),
      asset_class: css('--g-asset'),
      risk: css('--risk-high'),
      low: css('--risk-low'),
      medium: css('--risk-medium'),
      high: css('--risk-high'),
      link: css('--muted'),
      glass: css('--text'),
      accent: css('--accent'),
    };
  };
  readPalette();
  const colorOf = (n: Node) => palette[n.type];

  const lit = (n: Node) =>
    hovered ? n === hovered || !!neighbours.get(hovered.id)?.has(n.id) : focus ? focus.has(n.type) : true;
  const alphaOf = (n: Node) => (lit(n) ? 0.95 : hovered ? 0.1 : 0.07);
  const nodeColor = (n: Node) => hexToRgba(colorOf(n), alphaOf(n));
  const linkLit = (l: Link) => !!hovered && (endId(l.source) === hovered.id || endId(l.target) === hovered.id);
  // Links to risks are red, like the risks; the rest are neutral, or the accent when highlighted.
  const riskLink = (l: Link) => l.type === 'mitigated_by' || l.type === 'has_risk';
  const linkColor = (l: Link) => {
    const red = riskLink(l);
    if (linkLit(l)) return hexToRgba(red ? palette.risk : palette.accent, 0.9);
    if (hovered) return hexToRgba(palette.link, 0.04);
    if (focus) {
      if (!focusLinks.has(l.type)) return hexToRgba(red ? palette.risk : palette.link, red ? 0.04 : 0.025);
      return hexToRgba(red ? palette.risk : palette.accent, red ? 0.42 : 0.32);
    }
    return red ? hexToRgba(palette.risk, 0.2) : hexToRgba(palette.link, 0.16);
  };

  // Controls are teal shields and risks red warning signs (their level is in the tooltip). They
  // are flat sprites, so they always face the camera.
  const ICON_SIZE: Record<string, number> = { control: 21, risk: 23 };
  const icons = new Map<string, THREE.Texture>();
  const draw: Record<string, (g: CanvasRenderingContext2D) => void> = {
    // A shield with a tick.
    control: (g) => {
      g.fillStyle = palette.control;
      g.beginPath();
      g.moveTo(64, 8);
      g.lineTo(114, 26);
      g.lineTo(114, 60);
      g.bezierCurveTo(114, 92, 92, 112, 64, 122);
      g.bezierCurveTo(36, 112, 14, 92, 14, 60);
      g.lineTo(14, 26);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = '#04201d';
      g.lineWidth = 12;
      g.lineCap = g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(42, 64);
      g.lineTo(58, 80);
      g.lineTo(88, 46);
      g.stroke();
    },
    // A warning triangle with an exclamation mark.
    risk: (g) => {
      g.fillStyle = g.strokeStyle = palette.risk;
      g.lineJoin = 'round';
      g.lineWidth = 16;
      g.beginPath();
      g.moveTo(64, 14);
      g.lineTo(118, 110);
      g.lineTo(10, 110);
      g.closePath();
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = '#16090a';
      g.font = 'bold 66px system-ui, -apple-system, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText('!', 64, 104);
    },
  };
  // Each icon is drawn smaller than its canvas, with a soft halo of its own colour around it: a glow
  // baked into the image, which (unlike a bloom pass over thin lines) can't flicker as the graph turns.
  const icon = (type: string) => {
    if (!icons.has(type)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const g = canvas.getContext('2d')!;
      g.translate(64, 64);
      g.scale(0.78, 0.78);
      g.translate(-64, -64);
      g.shadowColor = palette[type];
      g.shadowBlur = 22;
      draw[type](g);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      icons.set(type, texture);
    }
    return icons.get(type)!;
  };
  const sprites = new Map<string, THREE.Sprite>();
  const iconObject = (n: Node) => {
    if (!draw[n.type]) return null as unknown as THREE.Object3D;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon(n.type), transparent: true, opacity: alphaOf(n), depthWrite: false }));
    // Drawn after the links in a fixed order, rather than re-sorted by distance every frame,
    // which made icons flip in front of and behind the links as the graph turned.
    sprite.renderOrder = 2;
    sprite.scale.set(ICON_SIZE[n.type], ICON_SIZE[n.type], 1);
    sprites.set(n.id, sprite);
    return sprite;
  };
  const paintIcons = () => {
    for (const n of nodes) {
      const sprite = sprites.get(n.id);
      if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = alphaOf(n);
    }
  };
  // Redraw the icons in the current palette (after a theme change).
  const redrawIcons = () => {
    icons.forEach((t) => t.dispose());
    icons.clear();
    for (const n of nodes) {
      const sprite = sprites.get(n.id);
      if (sprite) (sprite.material as THREE.SpriteMaterial).map = icon(n.type);
    }
  };

  const Graph = new ForceGraph3D(el, { controlType: 'orbit' })
    .showNavInfo(false)
    .graphData({ nodes, links })
    .nodeId('id')
    .nodeVal((n: Node) => SIZE[n.type] ?? 1)
    .nodeRelSize(RELSIZE)
    .nodeResolution(10)
    .nodeColor(nodeColor)
    .nodeThreeObject(iconObject)
    .nodeLabel(() => '')
    .nodeVisibility((n: Node) => visible.has(n.type))
    .linkVisibility((l: Link) => visible.has(typeOf(l.source)) && visible.has(typeOf(l.target)))
    .linkColor(linkColor)
    .linkWidth((l: Link) => (linkLit(l) ? 2 : 0))
    .linkDirectionalParticles((l: Link) => (focus && !hovered && focusLinks.has(l.type) ? 2 : 0))
    .linkDirectionalParticleSpeed(0.005)
    .linkDirectionalParticleWidth(1.8)
    .linkDirectionalParticleColor((l: Link) => (riskLink(l) ? palette.risk : palette.accent))
    .warmupTicks(30)
    .cooldownTicks(220)
    .onNodeHover((n: Node | null) => {
      if (locked) {
        // While the story scrolls, only the layer in focus answers the pointer. And since the
        // library re-checks the last pointer position every frame, a hover only changes when the
        // pointer has just moved, not when nodes drift under a pointer left resting on the page.
        if (n && focus && !focus.has(n.type)) n = null;
        if (performance.now() - lastMove > 300) return;
      }
      if (n === hovered) return;
      hovered = n;
      el.style.cursor = n?.href ? 'pointer' : n ? 'default' : locked ? 'default' : 'grab';
      tip.hidden = !n;
      const related = n ? [...(neighbours.get(n.id) ?? [])].map((id) => byId.get(id)!).filter((r) => visible.has(r.type)) : [];
      if (n) {
        const id = n.type === 'control' ? `<span class="tip-id">${esc(n.id)}</span>` : '';
        const level = n.type === 'risk' && n.level ? `<span class="tip-level tip-${n.level}">${LEVEL_LABEL[n.level]} with controls</span>` : '';
        const more = related.length > MAX_MINI ? ` · ${related.length - MAX_MINI} more not labelled` : '';
        tip.innerHTML =
          `<span class="tip-type">${TYPE_LABEL[n.type]}</span>${id}<strong>${esc(n.title)}</strong>${level}` +
          `<span class="tip-go">${related.length} connected${more}${n.href ? ' · click to open' : ''}</span>`;
      }
      showMini(related.slice(0, MAX_MINI));
      spin();
      refresh();
    })
    .onNodeClick((n: Node) => {
      if (n.href) location.href = n.href;
    });

  const refresh = () => {
    Graph.nodeColor(nodeColor).linkColor(linkColor).linkWidth(Graph.linkWidth());
    paintIcons();
  };

  // The shells layout: assets at the centre, out through policies, subjects and the control wall to the risks.
  Graph.d3Force('center', null);
  (Graph.d3Force('charge') as any).strength((n: Node) => (n.type === 'control_policy' ? -150 : -40));
  (Graph.d3Force('link') as any).distance(linkDistance);
  Graph.d3Force('shell', shellForce(() => 1 - Graph.d3VelocityDecay()) as any);

  // The background lives on the scene, where three.js colour-manages it.
  const paintBackground = () => {
    Graph.backgroundColor('rgba(0,0,0,0)');
    Graph.scene().background = new THREE.Color(palette.bg);
  };
  paintBackground();

  let guides: THREE.Group | null = null;
  const drawGuides = () => {
    if (guides) {
      Graph.scene().remove(guides);
      disposeGuides(guides);
    }
    guides = shellGuides({ counts, labels: SHELL_LABEL, colors: palette, glass: palette.glass, text: palette.control_policy, visible, focus });
    Graph.scene().add(guides);
  };
  drawGuides();

  // Small boxes beside a hovered node's neighbours: to the right of each node, or the left near
  // the edge, nudged down past any box they would overlap.
  let miniNodes: Node[] = [];
  let miniFrame = 0;
  function showMini(list: Node[]) {
    cancelAnimationFrame(miniFrame);
    miniNodes = list;
    mini.replaceChildren(
      ...list.map((r) => {
        const box = document.createElement('div');
        box.className = `mini mini-${r.type}`;
        const title = r.title.length > 46 ? r.title.slice(0, r.title.lastIndexOf(' ', 46)) + '…' : r.title;
        box.innerHTML = (r.type === 'control' ? `<span class="mini-id">${esc(r.id)}</span> ` : '') + esc(title);
        return box;
      }),
    );
    if (list.length) place();
  }
  function place() {
    const boxes = [...mini.children] as HTMLElement[];
    const width = stage.clientWidth;
    const placed = miniNodes
      .map((r, i) => {
        const { x, y } = Graph.graph2ScreenCoords(r.x ?? 0, r.y ?? 0, r.z ?? 0);
        const w = boxes[i].offsetWidth, h = boxes[i].offsetHeight;
        const left = x + 9 + w > width - 8 ? x - 9 - w : x + 9;
        return { box: boxes[i], left, top: y - h / 2, w, h };
      })
      .sort((a, b) => a.top - b.top);
    placed.forEach((p, i) => {
      for (const q of placed.slice(0, i)) {
        const across = p.left < q.left + q.w && q.left < p.left + p.w;
        if (across && p.top < q.top + q.h + 2) p.top = q.top + q.h + 2;
      }
      p.box.style.transform = `translate(${Math.round(p.left)}px, ${Math.round(p.top)}px)`;
    });
    miniFrame = requestAnimationFrame(place);
  }

  // The tooltip follows the pointer within the stage.
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    tip.style.transform = `translate(${Math.min(x + 14, r.width - tip.offsetWidth - 8)}px, ${Math.max(y - tip.offsetHeight - 14, 8)}px)`;
  });

  // Frame the outermost visible (or focused) shell, keeping the current viewing direction.
  let touched = false;
  const frame = (ms = 0) => {
    const camera = Graph.camera() as THREE.PerspectiveCamera;
    const shells = [...(focus ?? visible)].map((t) => SHELL[t] ?? 0);
    // Perspective makes a near sphere look bigger than its radius, so leave a generous margin.
    const outer = Math.max(...shells, 120) * 1.22 + 50;
    // With an offset, the graph has only the part of the width right of the text to fit in.
    const usable = stage.clientWidth > 900 ? 1 - 2 * Number(root.dataset.offset ?? 0) : 1;
    const aspect = (stage.clientWidth * usable) / Math.max(1, stage.clientHeight);
    const distance = outer / Math.tan(((camera.fov / 2) * Math.PI) / 180) / Math.min(1, aspect);
    const dir = camera.position.clone().normalize();
    if (dir.lengthSq() === 0 || !Number.isFinite(dir.x)) dir.set(0, 0, 1);
    Graph.cameraPosition({ x: dir.x * distance, y: dir.y * distance, z: dir.z * distance }, { x: 0, y: 0, z: 0 }, ms);
  };

  // Turn slowly until someone takes hold of it, pausing while a node is hovered.
  const controls = Graph.controls() as any;
  controls.autoRotateSpeed = 0.45;
  let spinning = !reduceMotion;
  const spin = () => (controls.autoRotate = spinning && !hovered);
  spin();
  controls.addEventListener('start', () => {
    touched = true;
    spinning = false;
    spin();
  });

  // A locked graph (a page locks it with `cg:lock`, as the home page story does while it's being
  // scrolled) can't be turned or zoomed, but its nodes still show their info on hover. On touch
  // screens the graph takes the pointer only after a tap, since it would otherwise swallow page
  // scrolling.
  let tapped = !touch;
  let lastMove = 0;
  stage.addEventListener('pointermove', () => (lastMove = performance.now()));
  stage.addEventListener('pointerleave', () => {
    lastMove = performance.now();
    if (hovered) Graph.onNodeHover()(null);
  });
  const applyPointer = () => {
    el.style.pointerEvents = tapped ? '' : 'none';
    el.style.cursor = locked ? 'default' : 'grab';
    controls.enabled = !locked;
    tap.hidden = locked || tapped;
  };
  tap.addEventListener('click', () => {
    tapped = true;
    applyPointer();
  });
  root.addEventListener('cg:lock', (e) => {
    locked = (e as CustomEvent<boolean>).detail;
    // Locking hands the camera back to the story: it frames each layer again and resumes turning.
    if (locked) {
      touched = false;
      spinning = !reduceMotion;
    }
    spin();
    if (locked && hovered) {
      hovered = null;
      tip.hidden = true;
      showMini([]);
      spin();
      refresh();
    }
    applyPointer();
  });
  applyPointer();

  // A plain scroll wheel scrolls the page; zooming takes a pinch (which browsers send as a wheel
  // event with ctrlKey) or Ctrl/⌘ held down.
  el.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
    },
    { capture: true },
  );

  // data-offset shifts the graph's centre right by that share of the width (on wide screens),
  // leaving room on the left for text laid over it: the canvas runs past the stage's right edge
  // by twice the shift, so its centre lands that far right of the stage's.
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    const shift = w > 900 ? Math.round(w * Number(root.dataset.offset ?? 0)) : 0;
    el.style.width = `${w + 2 * shift}px`;
    Graph.width(w + 2 * shift).height(h);
    if (!touched) frame();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // Show only some layers prominently: `cg:focus` with { types, links } on the element, or
  // the data-focus and data-focus-links attributes for a fixed focus.
  const setFocus = ({ types, links: linkTypes = [] }: Focus) => {
    focus = types?.length ? new Set(types) : null;
    if (locked && hovered && focus && !focus.has(hovered.type)) {
      lastMove = performance.now();
      Graph.onNodeHover()(null);
    }
    focusLinks = new Set(focus ? linkTypes : []);
    Graph.linkDirectionalParticles(Graph.linkDirectionalParticles());
    refresh();
    drawGuides();
    if (!touched) frame(reduceMotion ? 0 : 1400);
  };
  root.addEventListener('cg:focus', (e) => setFocus((e as CustomEvent<Focus>).detail));
  if (root.dataset.focus) setFocus({ types: root.dataset.focus.split(','), links: root.dataset.focusLinks?.split(',').filter(Boolean) ?? [] });

  keys.forEach((key) =>
    key.addEventListener('click', () => {
      const on = key.getAttribute('aria-pressed') !== 'true';
      key.setAttribute('aria-pressed', String(on));
      on ? visible.add(key.dataset.type!) : visible.delete(key.dataset.type!);
      Graph.nodeVisibility(Graph.nodeVisibility()).linkVisibility(Graph.linkVisibility());
      drawGuides();
    }),
  );

  // Follow the site's light/dark toggle.
  new MutationObserver(() => {
    readPalette();
    redrawIcons();
    paintBackground();
    refresh();
    drawGuides();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  status.hidden = true;
}
