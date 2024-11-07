import { render } from 'preact';
import { batch, signal } from '@preact/signals';

import './style.css';
import { B, baseToRepr, distance, embedInR, makeSphere, R, reprToBase, splitPointPair } from './geometric-algebra/conformal';
import { fail, Multivector } from './geometric-algebra/Algebra';

const output = signal("");

function log(...args: any[]) {
  output.value += args.join(" ") + "\n";
}

export function App() {
  return (
    <div>
      <h1>Output</h1>
      <pre style={{background: "#eee"}}>{output}</pre>
    </div>
  );
}

render(<App />, document.getElementById('app'));

const theInstructions = `
a 11
b 10
c 10 9
d 9 8
e 7
f 6 6
g 5
h 4 4
i 4 3
j 2 2
k 1 12 12
.
f g h
d h i
# i k a
`;

const r3 = Math.sqrt(3), r3half = r3 / 2;

const steps = Object.fromEntries(Object.entries({
  "12": [ 0 * r3half,  1  ],
   "1": [ 1 * r3half,  1.5],
   "2": [ 1 * r3half,  0.5],
   "3": [ 2 * r3half,  0  ],
   "4": [ 1 * r3half, -0.5],
   "5": [ 1 * r3half, -1.5],
   "6": [ 0 * r3half, -1  ],
   "7": [-1 * r3half, -1.5],
   "8": [-1 * r3half, -0.5],
   "9": [-2 * r3half,  0  ],
  "10": [-1 * r3half,  0.5],
  "11": [-1 * r3half,  1.5],
}).map(([k, [x, y]]) => [k, B.vec([x, y, 0])]));

/** The gap between to rays of the star. */
type Gap = {
  from: Multivector<never>,
  inner: Multivector<never>,
  to: Multivector<never>,
  prev: string,
  name: string,
  next: string,
}

const closeTo0 = (mv: Multivector<never>) =>
  [...mv].every(([, val]) => Math.abs(val) < 1e-8);

const rotorXY60  = B.mv({1: r3half, xy: -.5});

function parseInstructions(instructions: string) {
  const gapsArray: Gap[] = [];
  const gapsByName: Record<string, Gap> = {};
  const foldings: Gap[][] = [];
  let section: "polygon" | "folds" = "polygon";
  let pos = B.vec([0, 0, 0]);
  let prev = "";
  for (let line of instructions.trim().split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const words = line.split(/\s+/);
    switch (section) {
      case "polygon": {
        if (words[0] === ".") {
          if (!closeTo0(pos)) {
            console.error("polygon not closed; offset:", pos);
          }

          // complete gap linking:
          gapsArray.forEach((gap, i) => {
            gap.next = gapsArray[(i + 1) % gapsArray.length].name;
          });
          gapsArray[0].prev = gapsArray.at(-1).name;

          section = "folds";
          break;
        }
        const from = pos;
        const name = words.shift();
        for (const word of words) {
          pos = B.plus(pos, steps[word]);
        }
        const to = pos;
        const diff = B.minus(to, from);
        const inner = B.plus(from, B.sandwich(rotorXY60)(diff))
        const gap: Gap = {from, inner, to, prev, name, next: ""}
        gapsByName[name] = gap;
        gapsArray.push(gap);
        prev = name;
        break;
      }
      case "folds": {
        if (words.length !== 3) {
          console.error("folding instruction with bad length:", ...words);
        } else if (!words.every(word => Object.hasOwn(gapsByName, word))) {
          console.error("bad point reference in folding instruction:", ...words);
        } else {
          foldings.push(words.map(name => gapsByName[name]));
        }
        break;
      }
    }
  }
  return {gapsArray, gapsByName, foldings};
}

abstract class WithId {
  static count = 0;
  id: string;
  constructor() {
    this.id = "#" + WithId.count++;
  }
}

class HalfEdge extends WithId {
  loop: Loop;

  prev: HalfEdge;
  twin: HalfEdge;
  next: HalfEdge;

  to: Vertex;
  get from() { return this.twin.to; }

  toString() { return "he" + this.id; }
}

function findHE(from: Vertex, to: Vertex) {
  const results: HalfEdge[] = [];
  for (const he of from.halfEdgesOut()) {
    if (he.to === to) {
      results.push(he);
    }
  }
  if (results.length !== 1) fail(`Found ${results.length} half-edges from ${from.name} to ${to.name}.`);
  return results[0];
}

function makeEdge(f1: Loop, f2: Loop, to1: Vertex, to2: Vertex) {
  const he1 = new HalfEdge(), he2 = new HalfEdge();
  he1.twin = he2; he2.twin = he1;
  he1.loop = f1 ; he2.loop = f2;
  he1.to   = to1; he2.to   = to2;
  log(`new edge ${he1}|${he2} connecting ${to2} - ${to1} separating ${f1} | ${f2}`);
  return [he1, he2];
}

function chainHEs(first: HalfEdge, ...rest: HalfEdge[]) {
  let prev = first;
  for (let next of rest) {
    prev.next = next;
    next.prev = prev;
    prev = next;  
  }
}

class Vertex extends WithId {
  firstHalfEdgeOut: HalfEdge;
  name: string;
  pos: Multivector<never>;

  *halfEdgesOut() {
    let he = this.firstHalfEdgeOut;
    let count = 1;
    do {
      yield he;
      if (++count > 50) {
        log(`too many half edges around ${this}`);
        for (let i = 1, he = this.firstHalfEdgeOut; i < 50; i++, he = he.twin.next) {
          log(`  ${he}  ${he.loop}  ${he.to}`);
        }
        fail(`too many half edges around ${this}`);
      }
      he = he.twin.next;
    } while (he !== this.firstHalfEdgeOut);
  }

  *halfEdgesIn() {
    for (const he of this.halfEdgesOut()) {
      yield he.twin;
    }
  }

  *loops() {
    for (const he of this.halfEdgesOut()) {
      yield he.loop;
    }
  }

  *neighbors() {
    for (const he of this.halfEdgesOut()) {
      yield he.to;
    }
  }

  toString() {
    return `v${this.id}/${this.name}`;
  }
}

abstract class Loop extends WithId {
  name: string;
  firstHalfEdge: HalfEdge;

  *halfEdges() {
    let he = this.firstHalfEdge;
    let count = 1;
    do {
      yield he;
      if (++count > 50) {
        log(`too many half edges around ${this}`);
        for (let i = 1, he = this.firstHalfEdge; i < 50; i++, he = he.next) {
          log(`  ${he}  ${he.loop}  ${he.to}`);
        }
        fail(`too many half edges around ${this}`);
      }
      he = he.next;
    } while (he !== this.firstHalfEdge);
  }

  *vertices() {
    for (const he of this.halfEdges()) {
      yield he.to;
    }
  }

  *neighbors() {
    for (const he of this.halfEdges()) {
      yield he.twin.loop;
    }
  }
}

class Face extends Loop {
  toString() { return `f${this.id}/${this.name}`; }
}

class Boundary extends Loop {
  toString() { return `b${this.id}/${this.name}`; }
}

class Mesh {
  loops = new Set<Loop>();
  vertices = new Set<Vertex>();

  constructor(gapsArray: Gap[]) {
    const {loops, vertices} = this;
    const corners: Vertex[] = [];
    const star = new Face();
    star.name = "star";
    const outerspace = new Boundary();
    outerspace.name = "outerspace";
    loops.add(star).add(outerspace);
    log(`initial loopss: ${star}, ${outerspace}`)

    for (const gap of gapsArray) {
      const inner = new Vertex();
      inner.name = gap.name;
      inner.pos = gap.inner;

      const to = new Vertex();
      to.name = `[${gap.name}^${gap.next}]`;
      to.pos = gap.to;

      corners.push(inner, to);
      vertices.add(inner).add(to);
    }

    const innerLoop: HalfEdge[] = [];
    const outerLoop: HalfEdge[] = [];

    corners.forEach((vertex, i) => {
      const prev = corners.at(i - 1);
      const [he1, he2] = makeEdge(star, outerspace, vertex, prev);
      innerLoop.push(he1);
      outerLoop.unshift(he2);
      vertex.firstHalfEdgeOut = he2;
    });
    chainHEs(innerLoop.at(-1), ...innerLoop);
    chainHEs(outerLoop.at(-1), ...outerLoop);

    star.firstHalfEdge = innerLoop[0];
    outerspace.firstHalfEdge = outerLoop[0];
    this.checkMesh();
  }

  checkMesh() {
    let errorFound = false;
    function emitError(msg: string) {
      console.log(msg);
      log("ERROR: " + msg);
      errorFound = true;
      fail(msg);
    }

    const {vertices, loops} = this;

    function checkHE(he: HalfEdge, connectedFrom: any) {
      if (he.twin.twin !== he) {
        emitError(`inconsistent twins: ${he} -> ${he.twin} -> ${he.twin.twin}`);
      }
      if (he.prev.next !== he) {
        emitError(`inconsistent prev/next: ${he} -> ${he.prev} -> ${he.prev.next}`);
      }
      if (he.next.prev !== he) {
        emitError(`inconsistent next/prev: ${he} -> ${he.next} -> ${he.next.prev}`);
      }
      if (he.prev.loop !== he.loop) {
        emitError(`inconsistent he.prev.loop: ${he} ${he.loop} vs. ${he.prev} ${he.prev.loop}`)
      }
      if (he.next.loop !== he.loop) {
        emitError(`inconsistent he.next.loop: ${he} ${he.loop} vs. ${he.next} ${he.next.loop}`)
      }
      if (!vertices.has(he.to)) {
        emitError(`${he} connected from ${connectedFrom} references missing vertex ${he.to}`);
      }
      if (!loops.has(he.loop)) {
        emitError(`${he} connected from ${connectedFrom} references missing loop ${he.loop}`);
      }
    }

    // Some inconsistencies are reported multiple times.
    // Do we catch all inconsistencies?

    for (const loop of loops) {
      let i = 0;
      for (const he of loop.halfEdges()) {
        if (i > 50) {
          emitError(`loop ${loop} too long`)
        }
        if (he.loop !== loop) {
          log(`loop [${loop}]:`, [...loop.halfEdges()].map(he => `\n  ${he}  ${he.loop}  ${he.to}`).join(""));
          emitError(`${he}: he.loop ${he.loop} should be ${loop}`);
        }
        checkHE(he, loop);
      }
    }
    for (const vertex of vertices) {
      let i = 0;
      for (const he of vertex.halfEdgesOut()) {
        if (i > 50) {
          emitError(`neighborhood of vertex ${vertex} too long`)
        }
        checkHE(he, vertex);
        if (he.from !== vertex) {
          emitError(`${he}: he.from ${he.from} should be ${vertex} (he: ${he}, he.to: ${he.to})`);
        }
      }
    }
    log("mesh check: " + (errorFound ? "failed" : "ok"));
  }

  logMesh() {
    for (const loop of this.loops) {
      log("loop:", loop);
      let i = 0;
      const faceVertices = [];
      for (let he of loop.halfEdges()) {
        if (++i > 50) {
          log("TOO MANY FACE EDGES");
          break;
        }
        faceVertices.push(he.to);
        // log();
        // log("forw", he, he.twin, he.prev, he.next, he.from, he.from.name, he.to, he.to.name, he.loop? ?? "(noFace)");
        // he = he.twin;
        // log("back", he, he.twin, he.prev, he.next, he.from, he.from.name, he.to, he.to.name, he.loop? ?? "(noFace)");
      }
      log("  vertices:", faceVertices.map(vtx => vtx).join(" "));
    }
    for (const v of this.vertices) {
      const neighbors = [...v.neighbors()];
      log(
        v.toString().padEnd(15), v.firstHalfEdgeOut,
        v.pos.toString().padEnd(50),
        neighbors.length, "neighbors:", neighbors.join(" ").padEnd(35),
        "faces:", [...v.loops()].join(" "),
      );
    }
  }

  splitFace(face: Face, p: Vertex, q: Vertex) {
    log(`splitting ${p.name}-${q.name}`)
    const newFace = new Face();
    newFace.name = `split(${p.name}-${q.name})`;
    const [he1, he2] = makeEdge(face, newFace, q, p);
    const he1Prev = [...p.halfEdgesIn ()].find(he => he.loop === face);
    const he1Next = [...q.halfEdgesOut()].find(he => he.loop === face);
    const he2Prev = [...q.halfEdgesIn ()].find(he => he.loop === face);
    const he2Next = [...p.halfEdgesOut()].find(he => he.loop === face);
    chainHEs(he1Prev, he1, he1Next);
    chainHEs(he2Prev, he2, he2Next);
    face.firstHalfEdge = he1;
    newFace.firstHalfEdge = he2;
    for (const he of newFace.halfEdges()) {
      log(`###A: setting face of ${he} from ${he.loop} to ${newFace}`);
      he.loop = newFace;
    }

    this.loops.add(newFace);
    mesh.checkMesh();

    const beyond = new Set<Vertex>();
    function recur(v: Vertex) {
      if (v === p || v === q || beyond.has(v)) return;
      beyond.add(v);
      [...v.neighbors()].forEach(recur);
    }
    recur(he2.next.to);
    return beyond;
  }
}

const intersect3Spheres = (
  S1: Multivector<never>, S2: Multivector<never>, S3: Multivector<never>
) => splitPointPair(R.regressiveProduct(S1, S2, S3));

// TODO get rid of this global state?
let mesh: Mesh;
let verticesByName: Record<string, Vertex>;

function fold(folding: Gap[]) {
  log("=".repeat(160));
  const {loops, vertices} = mesh;
  const foldingVertices = folding.map(gap => verticesByName[gap.name]);
  const matches = [...loops].filter(loop => {
    if (!(loop instanceof Face)) return false;
    const faceVertices = [...loop.vertices()];
    return foldingVertices.every(v => faceVertices.includes(v));
  });
  if (matches.length !== 1) {
    console.error(
      `Expected 1 matching face for folding ${
        folding.map(gap => gap.name).join(" ")
      } but found ${matches.length}`,
    );
  }
  const [face] = matches;
  const [p, q, r] = foldingVertices;
  log(`bend ${face} along new edges ${p} - ${q} and ${q} - ${r}`)

  log("---------------------------------------------------------");
  const beyond_pq = mesh.splitFace(face, p, q);
  log("beyond1:", [...beyond_pq.values()].map(v => v.name).join(", "));
  mesh.logMesh();

  log("---------------------------------------------------------");
  const beyond_qr = mesh.splitFace(face, q, r);
  log("beyond2:", [...beyond_qr.values()].map(v => v.name).join(", "));
  mesh.logMesh();

  for (const vtx of beyond_pq) {
    if (beyond_qr.has(vtx)) {
      fail("overlap: " + vtx);
    }
  }

  const tip1 = [...q.halfEdgesOut()].find(he => he.loop instanceof Boundary).to;
  const tip2 = [...q.halfEdgesIn ()].find(he => he.loop instanceof Boundary).from;

  log("points:", [p, tip1, q, tip2, r].map(point =>
    `\n  ${point.name}: ${point.pos.toString()}`
  ).join(""));
  log("radii:", [
    distance(p.pos, tip1.pos),
    distance(q.pos, tip1.pos),
    distance(q.pos, tip2.pos),
    distance(r.pos, tip2.pos),
  ].map(d => "\n  " + d.toFixed(5)).join(""))
  const [inters1, inters2] = intersect3Spheres(
    makeSphere(baseToRepr(p.pos), baseToRepr(tip1.pos)),
    makeSphere(baseToRepr(q.pos), baseToRepr(tip1 /* or tip2 */.pos)),
    makeSphere(baseToRepr(r.pos), baseToRepr(tip2.pos)),
  ).map(reprToBase);
  log("intersections:");
  for (const inters of [inters1, inters2]) {
    log("  "+ inters);
  }
  log("distances:");
  for (const vtx of [p, q, r]) {
    [inters1, inters2].forEach((inters, i) =>
      log(`  ${vtx.name} - inters${i+1}: ${distance(vtx.pos, inters).toFixed(5)}`)
    );
  }

  for (const {beyond, tip} of [{beyond: beyond_pq, tip: tip1}, {beyond: beyond_qr, tip: tip2}]) {
    const dir1 = B.normalize(B.minus(inters1, q.pos));
    const dir2 = B.normalize(B.minus(tip.pos, q.pos));
    const dirMid = B.normalize(B.plus(dir1, dir2));
    const rot = B.geometricProduct(dir1, dirMid);
    const transform = (point: Multivector<never>) =>
      B.plus(B.sandwich(rot)(B.minus(point, q.pos)), q.pos);
    for (const vtx of beyond) {
      vtx.pos = transform(vtx.pos);
    }
  }

  log("ROTATED")
  mesh.checkMesh();
  mesh.logMesh();

  {
    // Merge the two vertices tip1 and tip2 to tip := [tip1|tip2]
    // and the two edges tip1-q and tip2-q to tip-q.

    if (distance(tip1.pos, tip2.pos) > 1e-8) {
      fail(`tips not properly aligned: ${tip1}@${tip1.pos} !== ${tip2}@${tip2.pos}`);
    }
    const he_tip1_q = findHE(tip1, q), he_q_tip1 = he_tip1_q.twin;
    const he_q_tip2 = findHE(q, tip2), he_tip2_q = he_q_tip2.twin;
    const boundary = he_q_tip1.loop;
    assert(boundary instanceof Boundary);
    assert(he_tip2_q.loop === boundary);
    assert(he_q_tip1.next.loop === boundary);
    assert(he_tip2_q.prev.loop === boundary);
    log(`Half edges ${he_tip2_q} and ${he_q_tip1} should become unreachable`);
    const hes_to_tip = [...tip1.halfEdgesIn(), ...tip2.halfEdgesIn()];

    const tip = new Vertex();
    tip.name = `[${tip1.name}|${tip2.name}]`;
    tip.pos = tip1.pos;

    for (const he of hes_to_tip) {
      he.to = tip;
    }

    he_q_tip2.twin = he_tip1_q;
    he_tip1_q.twin = he_q_tip2;

    chainHEs(he_tip2_q.prev, he_q_tip1.next);
    boundary.firstHalfEdge = he_q_tip1.next;

    q.firstHalfEdgeOut = he_q_tip2;
    tip.firstHalfEdgeOut = he_tip1_q;

    vertices.delete(tip1);
    vertices.delete(tip2);
    vertices.add(tip);

    log(`aligned tips \n  ${tip1}@${tip1.pos} and \n  ${tip2}@${tip1.pos} into \n  ${tip}@${tip.pos}`)
    mesh.checkMesh();

    const spannedVolume = B.wedgeProduct(
      B.minus(p  .pos, q.pos),
      B.minus(tip.pos, q.pos),
      B.minus(r  .pos, q.pos),
    );
    log("vol:", spannedVolume);
    if (closeTo0(spannedVolume)) {
      log(`merging coplanar faces ${he_q_tip2.loop} and ${he_tip1_q.loop}`);
      chainHEs(he_q_tip2.prev, he_tip1_q.next);
      chainHEs(he_tip1_q.prev, he_q_tip2.next);

      const newFace = new Face();
      newFace.name = `(${he_q_tip2.loop.name} + ${he_tip1_q.loop.name})`;
      newFace.firstHalfEdge = he_tip1_q.next;
      for (const he of newFace.halfEdges()) {
        log(`BA: setting face of ${he} from ${he.loop} to ${newFace}`);
        he.loop = newFace;
      }
      loops.delete(he_q_tip2.loop);
      loops.delete(he_tip1_q.loop);
      loops.add(newFace);
      log(`merged faces ${he_q_tip2.loop} and ${he_tip1_q.loop} to ${newFace}`);
    }
  }
}

function assert(test: boolean) {
  if (!test) {
    debugger;
    fail("assertion failed");
  }
}

function main() {
  log(theInstructions);

  const {gapsArray, gapsByName, foldings} = parseInstructions(theInstructions);
  // emit(JSON.stringify(parseInstructions(theInstructions), null, 2));

  mesh = new Mesh(gapsArray);
  mesh.logMesh();

  verticesByName = Object.fromEntries([...mesh.vertices].map(v => [v.name, v]))

  for (const folding of foldings) {
    fold(folding);
  }
}

main();
