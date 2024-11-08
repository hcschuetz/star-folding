import { render } from 'preact';
import { batch, signal } from '@preact/signals';

import './style.css';
import { assert, fail, log, setLogger } from './utils';
import { closeTo0, distance, E3, intersect3Spheres, MV, rotatePoints, rotXY60 } from './geom-utils';
import { Boundary, chainHEs, Face, findHE, HalfEdge, Loop, makeEdge, Vertex } from './mesh-components';

const output = signal("");

const background = signal("#fee");

setLogger(function logToOutput(...args: any[]) {
  output.value += args.join(" ") + "\n";
});

export function App() {
  return (
    <div>
      <h1>Output</h1>
      <pre style={{background: background.value}}>{output}</pre>
    </div>
  );
}

render(<App />, document.getElementById('app'));

const polygonDef = `
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
`;

const actionsDef = `
bend2 f g h
bend2 d h i
# bend2 i k a
`;

const r3 = Math.sqrt(3), r3half = r3 / 2;

const steps = {
  "12": E3.vec([ 0 * r3half,  2 / 2, 0]),
   "1": E3.vec([ 1 * r3half,  3 / 2, 0]),
   "2": E3.vec([ 1 * r3half,  1 / 2, 0]),
   "3": E3.vec([ 2 * r3half,  0 / 2, 0]),
   "4": E3.vec([ 1 * r3half, -1 / 2, 0]),
   "5": E3.vec([ 1 * r3half, -3 / 2, 0]),
   "6": E3.vec([ 0 * r3half, -2 / 2, 0]),
   "7": E3.vec([-1 * r3half, -3 / 2, 0]),
   "8": E3.vec([-1 * r3half, -1 / 2, 0]),
   "9": E3.vec([-2 * r3half,  0 / 2, 0]),
  "10": E3.vec([-1 * r3half,  1 / 2, 0]),
  "11": E3.vec([-1 * r3half,  3 / 2, 0]),
};

/**
 * One of the cut-out triangles (green in the Thurston paper).
 * We only give one star tip (= vertex of the overall polygon) called "from"
 * and the inward-pointing vertex "inner".
 * The other star tip (which would be called "to") is available as "from"
 * in the (circularly) next entry of the Gap array.
 */
type Gap = {
  name: string,
  fromPos: MV,
  innerPos: MV,

  from?: Vertex,
  inner?: Vertex,
};

function getGaps(def: string): Gap[] {
  let currentPos = E3.vec([0, 0, 0]);
  return def.trim().split(/\r?\n/)
    .filter(line => !line.startsWith("#"))
    .map(line => {
      const [name, ...moves] = line.trim().split(/\s+/);
      const fromPos = currentPos;
      for (const move of moves) {
        currentPos = E3.plus(currentPos, steps[move] ?? fail(`unknown step: ${move}`))
      }
      const innerPos = E3.plus(fromPos, rotXY60(E3.minus(currentPos, fromPos)));
      log(`${name}: from ${fromPos} inner ${innerPos}`);
      return {name, fromPos, innerPos}
    });
}

const parseActions = (def: string) =>
  def.trim().split(/\r?\n/)
  .filter(line => !line.startsWith("#"))
  .map(line => {
    const [cmd, ...args] = line.trim().split(/\s+/);
    return {cmd, args}
  });

class Mesh {
  loops = new Set<Loop>();
  vertices = new Set<Vertex>();
  verticesByName: Record<string, Vertex> = {};

  constructor(gaps: Gap[]) {
    const {loops, vertices, verticesByName} = this;
    const star = new Face();
    star.name = "star";
    const outerspace = new Boundary();
    outerspace.name = "outerspace";
    loops.add(star).add(outerspace);
    log(`initial loops: ${[...loops].join(", ")}`)

    const innerLoop: HalfEdge[] = [];
    const outerLoop: HalfEdge[] = [];

    gaps.forEach((gap, i) => {
      const from = new Vertex();
      from.name = `[${gaps.at(i-1).name}^${gap.name}]`;
      from.pos = gap.fromPos;

      const inner = new Vertex();
      inner.name = gap.name;
      inner.pos = gap.innerPos;

      gap.from = from;
      gap.inner = inner;

      vertices.add(from).add(inner);
      verticesByName[from.name] = from;
      verticesByName[inner.name] = inner;
    });

    gaps.forEach((gap, i) => {
      const {from, inner} = gap;
      const to = gaps[(i + 1) % gaps.length].from;

      const [he1, he2] = makeEdge(star, outerspace, inner, from);
      const [he3, he4] = makeEdge(star, outerspace, to, inner);
      he2.peer = he4;
      he4.peer = he2;

      innerLoop.push(he1, he3);
      outerLoop.unshift(he4, he2);

      from.firstHalfEdgeOut = he1;
      inner.firstHalfEdgeOut = he2;
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
      if (loop instanceof Face) {
        [...loop.vertices()].forEach((v, i, array) => {
          const v1 = array[(i + 1) % array.length];
          const v2 = array[(i + 2) % array.length];
          const v3 = array[(i + 3) % array.length];
          const vol = E3.wedgeProduct(
            E3.minus(v1.pos, v.pos),
            E3.minus(v2.pos, v.pos),
            E3.minus(v3.pos, v.pos),
          );
          if (!closeTo0(vol)) {
            fail(`face ${loop} not flat (${vol}): ${
              [v, v1, v2, v3].flatMap(vtx => [vtx, vtx.pos]).join(", ")
            }`);
          }
        });
        for (const he of loop.halfEdges()) {
          assert(he.peer === null);
        }
      } else if (loop instanceof Boundary) {
        for (const he of loop.halfEdges()) {
          assert(he.peer.peer === he);
          assert(Math.abs(
            E3.dist(he.from.pos, he.to.pos) -
            E3.dist(he.peer.from.pos, he.peer.to.pos),
          ) < 1e-8);
        }
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
      log("loop:", loop, "=", ...[...loop.halfEdges()].flatMap(he => [he, he.to]));
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
    log("---------------------------------------------------------");
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
    this.checkMesh();

    const beyond = new Set<Vertex>();
    function recur(v: Vertex) {
      if (v === p || v === q || beyond.has(v)) return;
      beyond.add(v);
      [...v.neighbors()].forEach(recur);
    }
    recur(he2.next.to);
    log(`beyond ${p} and ${q}: {${[...beyond].join(", ")}}`);
    this.logMesh();
    return beyond;
  }

  bend2(folding: string[]) {
    if (folding.length !== 3) fail("bend2 expects 3 args");
    const {loops, verticesByName} = this;
    const foldingVertices = folding.map(name => verticesByName[name]);
    const matches = [...loops].filter(loop => {
      if (!(loop instanceof Face)) return false;
      const faceVertices = [...loop.vertices()];
      return foldingVertices.every(v => faceVertices.includes(v));
    });
    if (matches.length !== 1) {
      console.error(
        `Expected 1 matching face for folding ${
          folding.join(" ")
        } but found ${matches.length}`,
      );
    }
    const [face] = matches;
    const [p, q, r] = foldingVertices;
    log(`bend ${face} along new edges ${p} - ${q} and ${q} - ${r}`)

    const beyond_pq = this.splitFace(face, p, q);
    const beyond_qr = this.splitFace(face, q, r);
    log("---------------------------------------------------------");

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
    ].map(d => "\n  " + d.toFixed(5)).join(""));
    const [inters1 /* , inters2 */] = intersect3Spheres(
      p.pos, tip1.pos,
      q.pos, tip1 /* or tip2 */.pos,
      r.pos, tip2.pos,
    );

    rotatePoints(p.pos, q.pos, tip1.pos, inters1, beyond_pq);
    rotatePoints(q.pos, r.pos, tip2.pos, inters1, beyond_qr);
    if (distance(tip1.pos, tip2.pos) > 1e-8) {
      fail(`tips ${tip1} and ${tip2} not properly aligned: ${tip1.pos} !== ${tip2.pos}`);
    }

    this.checkMesh();
    this.logMesh();

    const spannedVolume = E3.wedgeProduct(
      E3.minus(p   .pos, q.pos),
      E3.minus(tip1.pos, q.pos),
      E3.minus(r   .pos, q.pos),
    );
    log("vol:", spannedVolume);
    this.mergeEdges(tip1, q, tip2, closeTo0(spannedVolume));
  }

  /**
   * Merge the two vertices tip1 and tip2 to tip := [tip1|tip2]
   * and the two edges tip1-q and tip2-q to tip-q.
  */
  mergeEdges(tip1: Vertex, q: Vertex, tip2: Vertex, mergeFaces: boolean) {
    const {loops, vertices} = this;
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
    this.checkMesh();

    if (mergeFaces) {
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

const cmdNames = ["bend2", "reattach"];

function main() {
  const mesh = new Mesh(getGaps(polygonDef));
  mesh.logMesh();

  for (const {cmd, args} of parseActions(actionsDef)) {
    log("=".repeat(160));
    log(cmd, ...args);
    if (!cmdNames.includes(cmd)) fail(`Unknown command "${cmd}"`);
    mesh[cmd](args);
  }

  log("REACHED THE END");
  background.value = "#efe";
}

if (false) {
  main();
} else {
  try {
    main();
  } catch (e) {
    log(`CAUGHT EXCEPTION: ${e}`);
  }
}
