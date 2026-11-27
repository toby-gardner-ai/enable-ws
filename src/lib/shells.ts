// "Shells" layout for the home page control graph, after the Defence in depth view of the
// ai-governance repo's Control Graph: each node type sits on its own sphere around the centre,
// and the nodes on a sphere are spread over it evenly.
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

type Vec = [number, number, number];
type SimNode = { id: string; type: string; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number; fx?: number };

// Radius of each type's shell: assets at the centre, the obligation chain outwards to the controls,
// and the risks outside the control wall.
export const SHELL: Record<string, number> = { asset_class: 70, control_policy: 190, governance_subject: 320, control: 460, risk: 610 };
const radius = (n: SimNode) => SHELL[n.type] ?? 300;

// N points spread almost evenly over a sphere (a Fibonacci, golden-angle, lattice).
function lattice(n: number): Vec[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const w = Math.sqrt(1 - y * y);
    return [Math.cos(i * golden) * w, y, Math.sin(i * golden) * w];
  });
}
const unit = (x: number, y: number, z: number): Vec => {
  const r = Math.hypot(x, y, z);
  return r > 1e-6 ? [x / r, y / r, z / r] : [1, 0, 0];
};
const dist2 = (a: Vec, b: Vec) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// Match each node on a shell to a nearby lattice point, so neighbours stay neighbours:
// closest pairs first, then a few passes swapping any two nodes whose swap shortens their moves.
function assign(nodes: SimNode[]): Map<string, Vec> {
  const at = nodes.map((n) => unit(n.x ?? 0, n.y ?? 0, n.z ?? 0));
  const points = lattice(nodes.length);
  const match = new Array<number>(nodes.length).fill(-1);
  const used = new Array<boolean>(nodes.length).fill(false);
  const pairs: [number, number, number][] = [];
  at.forEach((a, i) => points.forEach((p, j) => pairs.push([dist2(a, p), i, j])));
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [, i, j] of pairs) if (match[i] < 0 && !used[j]) (match[i] = j), (used[j] = true);
  for (let pass = 0, swapped = true; swapped && pass < 3; pass++) {
    swapped = false;
    for (let i = 0; i < nodes.length; i++)
      for (let k = i + 1; k < nodes.length; k++) {
        const now = dist2(at[i], points[match[i]]) + dist2(at[k], points[match[k]]);
        if (dist2(at[i], points[match[k]]) + dist2(at[k], points[match[i]]) < now - 1e-9) {
          [match[i], match[k]] = [match[k], match[i]];
          swapped = true;
        }
      }
  }
  return new Map(nodes.map((n, i) => [n.id, points[match[i]]]));
}

// A constraint that runs after the link and charge forces: it puts each node back on its shell,
// so the other forces only slide it over the surface. After a short free warm-up, each node takes
// its lattice point and glides there. `keep` is 1 − the simulation's velocity decay.
export function shellForce(keep: () => number, warmup = 50) {
  let nodes: SimNode[] = [];
  let slots = new Map<string, Vec>();
  let ticks = 0;
  const force = () => {
    if (!slots.size && ++ticks >= warmup) {
      const byType = new Map<string, SimNode[]>();
      for (const n of nodes) byType.set(n.type, [...(byType.get(n.type) ?? []), n]);
      for (const group of byType.values()) for (const [id, u] of assign(group)) slots.set(id, u);
    }
    const k = keep();
    for (const n of nodes) {
      if (n.fx != null) continue; // held by a drag
      const R = radius(n);
      const nx = (n.x ?? 0) + (n.vx ?? 0) * k, ny = (n.y ?? 0) + (n.vy ?? 0) * k, nz = (n.z ?? 0) + (n.vz ?? 0) * k;
      const u = slots.get(n.id) ?? unit(nx, ny, nz);
      const t: Vec = [u[0] * R, u[1] * R, u[2] * R];
      // Far from its place, a node travels part of the way each tick, so it glides rather than jumps.
      const share = Math.hypot(t[0] - nx, t[1] - ny, t[2] - nz) > 30 ? 0.15 : 1;
      n.vx = (nx + (t[0] - nx) * share - (n.x ?? 0)) / k;
      n.vy = (ny + (t[1] - ny) * share - (n.y ?? 0)) / k;
      n.vz = (nz + (t[2] - nz) * share - (n.z ?? 0)) / k;
    }
  };
  force.initialize = (ns: SimNode[]) => (nodes = ns);
  return force;
}

// A link is as long as the gap between its two shells, so links line nodes up across shells
// instead of fighting the shell force.
export const linkDistance = (l: { source: SimNode; target: SimNode }) => Math.max(24, Math.abs(radius(l.source) - radius(l.target)));

// A faint globe in its own colour and a label for every shell, and the title at the centre.
// With a focus, the focused shells stand out and the others all but disappear.
export function shellGuides(opts: {
  counts: Record<string, number>;
  labels: Record<string, string>;
  colors: Record<string, string>;
  glass: string; // the risk shell's clear glass, whose red comes from its nodes and links
  text: string;
  visible: Set<string>;
  focus: Set<string> | null;
}): THREE.Group {
  const group = new THREE.Group();
  for (const [type, R] of Object.entries(SHELL)) {
    if (!opts.visible.has(type) || !opts.counts[type]) continue;
    const focused = !!opts.focus?.has(type);
    // The risk shell is a clear, colourless glass sphere; the others are wireframe globes, with fewer
    // segments on the small inner ones so they don't turn solid.
    const segments = R < 100 ? 12 : R < 250 ? 20 : 28;
    const globe =
      type === 'risk'
        ? new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), glass(opts.glass, focused ? 0.09 : opts.focus ? 0.025 : 0.05))
        : new THREE.Mesh(
            new THREE.SphereGeometry(R, segments, Math.round(segments / 2)),
            new THREE.MeshBasicMaterial({ color: opts.colors[type], wireframe: true, transparent: true, opacity: focused ? 0.1 : opts.focus ? 0.015 : 0.045, depthWrite: false }),
          );
    globe.renderOrder = -1;
    group.add(globe);
    const size = (type === 'asset_class' ? 11 : 15) * (focused ? 1.5 : 1);
    const label = new SpriteText(opts.labels[type], size, opts.colors[type]);
    label.material.opacity = opts.focus && !focused ? 0.25 : 1;
    label.fontFace = 'system-ui, -apple-system, sans-serif';
    label.fontWeight = '600';
    label.material.depthWrite = false;
    label.position.set(0, R + 18, 0);
    group.add(label);
  }
  const title = new SpriteText('AI Project', 18, opts.text);
  title.fontFace = 'system-ui, -apple-system, sans-serif';
  title.fontWeight = '700';
  title.material.depthWrite = false;
  title.material.depthTest = false;
  title.renderOrder = 20;
  group.add(title);
  return group;
}

// A see-through shell: faint face-on, brighter towards the rim where you look along its surface.
function glass(color: string, strength: number) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float strength;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.2);
        gl_FragColor = vec4(color, strength * (0.04 + 0.96 * rim));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    // Front faces only: a double-sided transparent sphere blends its two surfaces in an order
    // that shifts as it turns, which flickers.
    side: THREE.FrontSide,
  });
}

// Free the GPU memory a group of guides holds.
export function disposeGuides(group: THREE.Group) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => (mat as THREE.Material | undefined)?.dispose());
  });
}
