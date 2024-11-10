import { render } from 'preact';
import { batch, signal } from '@preact/signals';

import './style.css';
import { assert, fail, log, setLogger } from './utils';
import { closeTo0, distance, E3, intersect3Spheres, MV, rotatePoints, rotXY60 } from './geom-utils';
import { chainHEs, findHE, HalfEdgeG, LoopG, MeshG, VertexG } from './mesh';

const output = signal("");

const background = signal("#fee");

setLogger(function logToOutput(...args: any[]) {
  output.value += args.join(" ") + "\n";
});

export function App() {
  return (
    <div>
      <h1>Output</h1>
      <pre style={{background: background.value, padding: 5}}>{output}</pre>
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
#reattachL b c
#reattachR e d
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

const parseActions = (def: string) =>
  def.trim().split(/\r?\n/)
  .filter(line => !line.startsWith("#"))
  .map(line => {
    const [cmd, ...args] = line.trim().split(/\s+/);
    return {cmd, args}
  });


type VData = { pos: MV };
type LData = { isFace: boolean };
type EData = { peer: HalfEdge | null };
type Loop = LoopG<VData, LData, EData>;
type Vertex = VertexG<VData, LData, EData>;
type HalfEdge = HalfEdgeG<VData, LData, EData>;

function setPeers(he0: HalfEdge, he1: HalfEdge) {
  he0.d = {peer: he1};
  he1.d = {peer: he0};
}
const peerNull = {peer: null};
function noPeers(he0: HalfEdge, he1: HalfEdge) {
  he0.d = he1.d = peerNull;
}
const edgeLength = ({from, to}: HalfEdge) => distance(from.d.pos, to.d.pos);
function assertPeers(he0: HalfEdge, he1: HalfEdge) {
  assert(!he0.loop.d.isFace);
  assert(he0.loop === he1.loop);
  assert(he0.d.peer === he1);
  assert(he1.d.peer === he0);
  assert(Math.abs(edgeLength(he0) - edgeLength(he1)) < 1e-8);
}

class Mesh extends MeshG<VData, LData, EData> {
  verticesByName: Record<string, Vertex> = {};

  constructor(def: string) {
    super(log, fail);
    const {verticesByName} = this;

    const [innerHE, outerHE] = this.addCore();
    noPeers(innerHE, innerHE);
    setPeers(outerHE, outerHE); // just to make the consistency check happy
    Object.assign(innerHE.loop, {name: "star"      , d: {isFace: true }});
    Object.assign(outerHE.loop, {name: "outerspace", d: {isFace: false}});
    Object.assign(innerHE.to, {name: "dummy", d: {pos: E3.vec([0, 0, 0])}});
    this.logMesh();
    this.checkWithData();

    let currentPos = E3.vec([0, 0, 0]);

    def.trim().split(/\r?\n/).map(line => line.trim())
    .filter(line => !(line === "" && line.startsWith("#")))
    .map(line => {
      const [name, ...moves] = line.split(/\s+/);
      const fromPos = currentPos;
      for (const move of moves) {
        currentPos = E3.plus(currentPos, steps[move] ?? fail(`unknown step: ${move}`))
      }
      const innerPos = E3.plus(fromPos, rotXY60(E3.minus(currentPos, fromPos)));
      return {name, fromPos, innerPos}
    })
    .forEach(({name, fromPos, innerPos}, i, gaps) => {
      const [innerHE1, outerHE1] = this.splitEdgeAcross(outerHE);  
      const tip = innerHE1.from;
      tip.name = `[${gaps.at(i-1).name}^${name}]`;
      tip.d = {pos: fromPos};
      verticesByName[tip.name] = tip;

      const [innerHE2, outerHE2] = this.splitEdgeAcross(outerHE);
      const inward = innerHE2.from;
      inward.name = name;
      inward.d = {pos: innerPos};
      verticesByName[inward.name] = inward;

      noPeers(innerHE1, innerHE2);
      setPeers(outerHE1, outerHE2);
    });

    if (E3.normSquared(currentPos) > 1e-12) fail(
      `polygon not closed; offset: ${JSON.stringify(currentPos)}`
    );

    // remove dummy node
    this.contractEdge(outerHE);
  }

  checkWithData() {
    this.check();

    function emitError(msg: string) {
      console.log(msg);
      log("ERROR: " + msg);
      fail(msg);
    }

    for (const loop of this.loops) {
      if (loop.d.isFace) {
        [...loop.vertices()].forEach((v, i, array) => {
          const v1 = array[(i + 1) % array.length];
          const v2 = array[(i + 2) % array.length];
          const v3 = array[(i + 3) % array.length];
          const vol = E3.wedgeProduct(
            E3.minus(v1.d.pos, v.d.pos),
            E3.minus(v2.d.pos, v.d.pos),
            E3.minus(v3.d.pos, v.d.pos),
          );
          if (!closeTo0(vol)) {
            fail(`face ${loop} not flat (${vol}): ${
              [v, v1, v2, v3].flatMap(vtx => [vtx, vtx.d.pos]).join(", ")
            }`);
          }
        });
        for (const he of loop.halfEdges()) {
          assert(he.d.peer === null);
        }
      } else {
        for (const he of loop.halfEdges()) {
          const {peer} = he.d;
          if (peer) assertPeers(he, peer);
        }
      }
    }
    for (const vertex of this.vertices) {
      let i = 0;
      for (const he of vertex.halfEdgesOut()) {
        if (i > 50) {
          emitError(`neighborhood of vertex ${vertex} too long`)
        }
        if (he.from !== vertex) {
          emitError(`${he}: he.from ${he.from} should be ${vertex} (he: ${he}, he.to: ${he.to})`);
        }
      }
    }
    log("mesh checked");
  }

  logMesh() {
    for (const loop of this.loops) {
      log("loop:", loop, "=", ...[...loop.halfEdges()].flatMap(he => [he, he.to]));
    }
    for (const v of this.vertices) {
      const neighbors = [...v.neighbors()];
      log(
        v.toString().padEnd(15), v.firstHalfEdgeOut,
        v.d?.pos.toString().padEnd(50) ?? "MISSING",
        neighbors.length, "neighbors:", neighbors.join(" ").padEnd(35),
        "faces:", [...v.loops()].join(" "),
      );
    }
  }

  collectVertices(start: Vertex, exclude: Set<Vertex>) {
    const collected = new Set<Vertex>();
    function recur(v: Vertex) {
      if (exclude.has(v) || collected.has(v)) return;
      collected.add(v);
      [...v.neighbors()].forEach(recur);
    }
    recur(start);
    log(`collected: {${[...collected].join(", ")}}`);
    return collected;
  }

  splitFace(face: Loop, p: Vertex, q: Vertex) {
    log("---------------------------------------------------------");
    log(`splitting ${p.name}-${q.name}`)
    this.checkWithData();

    const halfEdges = [...face.halfEdges()];
    const [he0, he1] = this.splitLoop(
      halfEdges.find(he => he.to === p),
      halfEdges.find(he => he.to === q),
      {create: "right"}
    )
    noPeers(he0, he1);
    const newFace = he1.loop;
    log("new face temp name:", newFace.name);
    newFace.d = {isFace: true};
    newFace.name = `split(${p.name}-${q.name})`;
    log("new face new name:", newFace.name);
    this.logMesh()
    this.checkWithData();
    log("splitFace done")
  }

  bend2(args: string[]) {
    if (args.length !== 3) fail("bend2 expects 3 args");
    const {loops, verticesByName} = this;
    const argVertices = args.map(name => verticesByName[name]);
    const matchedFaces = [...loops].filter(loop => {
      if (!(loop.d.isFace)) return false;
      const faceVertices = [...loop.vertices()];
      return argVertices.every(v => faceVertices.includes(v));
    });
    if (matchedFaces.length !== 1) {
      console.error(
        `Expected 1 matching face for bend2 ${args.join(" ")
        } but found ${matchedFaces.length}`,
      );
    }
    const [face] = matchedFaces;
    const [p, q, r] = argVertices;
    log(`bend ${face} along new edges ${p} - ${q} and ${q} - ${r}`)

    const tip1 = [...q.halfEdgesOut()].find(he => !he.loop.d.isFace).to;
    const tip2 = [...q.halfEdgesIn ()].find(he => !he.loop.d.isFace).from;

    log("points:", [p, tip1, q, tip2, r].map(point =>
      `\n  ${point.name}: ${point.d.pos.toString()}`
    ).join(""));

    this.splitFace(face, p, q);
    this.splitFace(face, q, r);

    const border = new Set([p, q, r]);
    const beyond_pq = this.collectVertices(tip1, border);
    const beyond_qr = this.collectVertices(tip2, border);
    log("---------------------------------------------------------");

    if ([...beyond_pq].some(vtx => beyond_qr.has(vtx))) fail(
      `overlapping parts:\n  {${
        [...beyond_pq].join(" ")}
      }\n  {${
        [...beyond_qr].join(" ")}
      }`
    );
    log("radii:", [
      distance(p.d.pos, tip1.d.pos),
      distance(q.d.pos, tip1.d.pos),
      distance(q.d.pos, tip2.d.pos),
      distance(r.d.pos, tip2.d.pos),
    ].map(d => "\n  " + d.toFixed(5)).join(""));
    const [inters1 /* , inters2 */] = intersect3Spheres(
      p.d.pos, tip1.d.pos,
      q.d.pos, tip1 /* or tip2 */.d.pos,
      r.d.pos, tip2.d.pos,
    );

    rotatePoints(p.d.pos, q.d.pos, tip1.d.pos, inters1, [...beyond_pq].map(v => v.d));
    rotatePoints(q.d.pos, r.d.pos, tip2.d.pos, inters1, [...beyond_qr].map(v => v.d));
    if (distance(tip1.d.pos, tip2.d.pos) > 1e-8) {
      fail(`tips ${tip1} and ${tip2} not properly aligned: ${tip1.d.pos} !== ${tip2.d.pos}`);
    }

    const spannedVolume = E3.wedgeProduct(
      E3.minus(p   .d.pos, q.d.pos),
      E3.minus(tip1.d.pos, q.d.pos),
      E3.minus(r   .d.pos, q.d.pos),
    );
    log("vol:", spannedVolume);
    this.mergeEdges(tip1, q, tip2, closeTo0(spannedVolume));
  }

  /**
   * Merge the two vertices tip1 and tip2 to tip := [tip1|tip2]
   * and the two edges tip1-q and tip2-q to tip-q.
  */
  mergeEdges(tip1: Vertex, q: Vertex, tip2: Vertex, mergeFaces: boolean) {
    const {vertices} = this;
    const he_tip1_q = findHE(tip1, q), he_q_tip1 = he_tip1_q.twin;
    const he_q_tip2 = findHE(q, tip2), he_tip2_q = he_q_tip2.twin;
    assertPeers(he_q_tip1, he_tip2_q);
    noPeers(he_q_tip1, he_tip2_q);
    log(`Half edges ${he_tip2_q} and ${he_q_tip1} should become unreachable`);

    // TODO use higher-level Mesh methods.

    const tmpEdge = this.splitLoop(he_q_tip1, he_tip2_q.prev, {create: "left"});
    tip1.name = `[${tip1.name}|${tip2.name}]`
    this.contractEdge(tmpEdge[0]);
    this.dropEdge(he_tip1_q.twin);
    this.checkWithData();

    if (mergeFaces) {
      // TODO create a test case for this situation
      log(`merging coplanar faces ${he_q_tip2.loop} and ${he_tip1_q.loop}`);
      this.dropEdge(he_tip1_q); // or he_q_tip2?
      log(`merged faces ${he_q_tip2.loop} into ${he_tip1_q.loop}`);
    }
  }

  reattachL(args: string[]) { this.reattach("L", args); }
  reattachR(args: string[]) { this.reattach("R", args); }

  reattach(lr: "L"| "R", args: string[]) {
    fail("unimplemented");
  }
}

const cmdNames = ["bend2", "reattachL", "reattachR"];

function main() {
  log(polygonDef.trim() + "\n------\n" + actionsDef.trim() + "\n-------");

  const mesh = new Mesh(polygonDef);
  mesh.logMesh();
  mesh.checkWithData();

  for (const {cmd, args} of parseActions(actionsDef)) {
    log("=".repeat(160));
    log(cmd, ...args);
    if (!cmdNames.includes(cmd)) fail(`Unknown command "${cmd}"`);
    mesh[cmd](args);
    mesh.logMesh();
    mesh.checkWithData();
  }

  log("REACHED THE END");
  background.value = "#efe";
}

if (!false) {
  main();
} else {
  try {
    main();
  } catch (e) {
    log(`CAUGHT EXCEPTION: ${e}`);
  }
}
