import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as B from 'babylonjs';

import './style.css';
import { fail, getLines, log, setLogger } from './utils';
import { closeTo0, distance, E3, intersect3Spheres, MV, projectPointToLine, rotatePoints, rotXY60 } from './geom-utils';
import { findHE, HalfEdgeG, LoopG, MeshG, VertexG } from './mesh';
import { TAU } from './geometric-algebra/utils';
import { initialActionsDef, initialPolygonDef } from './init';


type PhaseData = {
  logTitle: string;
  logText: string;
  ok: boolean;

  /** Contains (x,y,z) triplets of coordinates */
  vertices: B.Vector3[],
  /** Contains pairs of vertex indices */
  edges: [number, number][],
  /** Contains triplets of vertex indices */
  triangles: [number, number, number][],
}

export function App() {
  const polygonDefElem = useRef<HTMLTextAreaElement>();
  const actionsDefElem = useRef<HTMLTextAreaElement>();

  const [phases, setPhases] = useState<PhaseData[]>([]);

  function run() {
    const phasesList: PhaseData[] = [];

    const polygonDef = polygonDefElem.current.value;
    const actionsDef = actionsDefElem.current.value;

    let logText = "";
    let ok = true;
    const log = (...args: any[]) => { logText += args.join(" ") + "\n"; };
    setLogger(log);
    const fail = (msg: string) => { throw new Error("FAILED: " + msg); };
    let mesh = new Mesh(log, fail);

    function emitPhase(logTitle: string) {
      const vertexArray = [...mesh.vertices];
      const vertexToIndex = new Map(vertexArray.map((v, i) => [v, i]));
      phasesList.push({
        logTitle, logText, ok,
        vertices: vertexArray.map(v => {
          const mv = v.d.pos;
          return new B.Vector3(mv.value("x"), mv.value("y"), mv.value("z"));
        }),
        edges: vertexArray.flatMap(v =>
          [...v.neighbors()].map(w =>
            [vertexToIndex.get(v), vertexToIndex.get(w)] as [number, number]
          ).filter(([i, j]) => i <= j)
        ),
        triangles: [], // TODO fill with data
      });
    }

    createPhases: {
      try {
        mesh.setup(polygonDef);
        mesh.logMesh();
        mesh.checkWithData();
      } catch (e) {
        ok = false;
        log("CAUGHT EXCEPTION:", e);
        break createPhases;
      }
      finally {
        emitPhase("initialize")
      }

      for (let line of getLines(actionsDef)) {
        logText = "";
        try {
          const [cmd, ...args] = line.trim().split(/\s+/);
          if (!cmdNames.includes(cmd)) fail(`Unknown command "${cmd}"`);
          mesh[cmd](args);
          mesh.logMesh();
          mesh.checkWithData();
        } catch (e) {
          ok = false;
          log("CAUGHT EXCEPTION:", e);
          break createPhases;
        } finally {
          emitPhase(line);
        }
      }
    }

    setPhases(phasesList);
  }

  return (
    <div>
      <textarea ref={polygonDefElem}>
        {initialPolygonDef.trim()}
      </textarea>
      <textarea ref={actionsDefElem}>
        {initialActionsDef.trim()}
      </textarea>
      <button onClick={run}>run</button>
      {
        phases.length > 0 &&
        <div>
        {phases.length - 1} transformations; {phases.at(-1)?.ok ? "ok" : "failed"}
        </div>
      }
      {phases.map((phaseData) => <Phase phaseData={phaseData}/>)}
    </div>
  );
}

function Phase(props: {phaseData: PhaseData}) {
  const {logTitle, logText, ok, vertices, edges, triangles} = props.phaseData;
  const canvas = useRef<HTMLCanvasElement>();

  useEffect(() => renderToCanvas(canvas.current, vertices, edges, triangles));

  return (
    <div className="phase" style={`background: #${ok ? "efe" : "fee"};`}>
      <details open={!ok}>
        <summary><code>{logTitle}</code></summary>
        <pre>{logText}</pre>
      </details>
      <canvas ref={canvas}/>
    </div>
  )
}

function renderToCanvas(
  canvas: HTMLCanvasElement,
  vertices: B.Vector3[],
  edges: [number, number][],
  triangles: [number, number, number][],
) {
  const noBubble = (e: Event) => e.preventDefault();
  canvas.addEventListener("wheel", noBubble);

  const engine = new B.Engine(canvas, true);
  const scene = new B.Scene(engine);

  const lineMaterial = new B.StandardMaterial("myMaterial", scene);
  lineMaterial.diffuseColor = B.Color3.Yellow();

  const gridMaterial = new B.StandardMaterial("myMaterial", scene);
  gridMaterial.diffuseColor = B.Color3.Black();

  const center = vertices
    .reduce((acc, v) => acc.addInPlace(v), B.Vector3.Zero())
    .scaleInPlace(1 / vertices.length);

  const root = new B.TransformNode("root", scene);
  root.position = center.negate();

  vertices.forEach((pos, i) => {
    const ball = B.MeshBuilder.CreateIcoSphere("vtx" + i, {radius: .05});
    ball.position = pos;
    ball.parent = root;
  });
  edges.forEach(indices => {
    const line = B.MeshBuilder.CreateTube(`line${indices}`, {
      path: indices.map(i => vertices[i]),
      radius: .02,
    });
    line.material = lineMaterial;
    line.parent = root;
  });

  for (let i = -12; i < 4; i++) {
    for (const [skewDown, skewUp] of [[0,0], [-5,+5], [+5,-5]]) {
      const line = B.MeshBuilder.CreateTube("grid", {
        path: [
          new B.Vector3((i+skewDown)*r3half, -5, 0),
          new B.Vector3((i+skewUp  )*r3half, +5, 0),
        ],
        radius: 0.005,
      });
      line.material = gridMaterial;
      line.parent = root;
    }
  }

  const camera = new B.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2, 10, new B.Vector3(0, 0, 0), scene);
  camera.attachControl(canvas, true);

  const light = new B.HemisphericLight("light", new B.Vector3(1, 1, 0), scene);
  light.intensity = 3;

  const renderScene = () => scene.render()
  engine.runRenderLoop(renderScene);

  const resizeEngine = () => engine.resize();
  window.addEventListener("resize", resizeEngine);

  return () => {
    window.removeEventListener("resize", resizeEngine);
    engine.stopRenderLoop(renderScene);
    engine.dispose();
    canvas.removeEventListener("wheel", noBubble);  
  };
}

render(<App />, document.getElementById('app'));

// -----------------------------------------------------------------------------

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


type VData = { pos: MV };
type LData = { isFace: boolean };
type EData = void;
type Loop = LoopG<VData, LData, EData>;
type Vertex = VertexG<VData, LData, EData>;
type HalfEdge = HalfEdgeG<VData, LData, EData>;

function isBetweenCoplanarLoops(he: HalfEdge): boolean {
  // Search for parallelepipeds with non-zero volume spanned by 4 vertices
  // from `he`'s adjacent loop and `he.twin`'s adjacent loop.
  // The two loops are coplanar iff no such parallelepiped exists.

  const vertices =
    [...new Set<Vertex>([...he.loop.vertices(), ...he.twin.loop.vertices()])];
  const nVertices = vertices.length;

  for (let i = 0; i < nVertices - 3; i++) {
    const base = vertices[i].d.pos;
    for (let j = i + 1; j < nVertices - 2; j++) {
      const len_ij = E3.minus(vertices[j].d.pos, base);
      if (closeTo0(len_ij)) break; // (*)
      for (let k = j + 1; k < nVertices - 1; k++) {
        const area_ijk = E3.wedgeProduct(len_ij, E3.minus(vertices[k].d.pos, base));
        if (closeTo0(area_ijk)) break; // (*)
        for (let l = k + 1; l < nVertices; l++) {
          const vol_ijkl = E3.wedgeProduct(area_ijk, E3.minus(vertices[l].d.pos, base));
          if (closeTo0(vol_ijkl)) break;
          return false;
        }
      }
    }
  }
  // (*) Are these checks worthwhile?  They are not needed for correctness.
  return true;
}

class Mesh extends MeshG<VData, LData, EData> {
  verticesByName: Record<string, Vertex> = {};

  constructor(
    log: (...args: any[]) => unknown,
    fail: (msg: string) => never,
  ) {
    super(log, fail);
  }

  setup(def: string) {
    const {verticesByName} = this;

    const [innerHE, outerHE] = this.addCore();
    Object.assign(innerHE.loop, {name: "star"      , d: {isFace: true }});
    Object.assign(outerHE.loop, {name: "outerspace", d: {isFace: false}});
    Object.assign(innerHE.to, {name: "dummy", d: {pos: E3.vec([0, 0, 0])}});
    this.logMesh();
    this.checkWithData();

    let currentPos = E3.vec([0, 0, 0]);
    let tips: Vertex[] = [];

    for (let line of getLines(def)) {
      const [name, ...moves] = line.split(/\s+/);
      const fromPos = currentPos;
      for (const move of moves) {
        currentPos = E3.plus(currentPos, steps[move] ?? fail(`unknown step: ${move}`))
      }
      const innerPos = E3.plus(fromPos, rotXY60(E3.minus(currentPos, fromPos)));

      const [innerHE0, outerHE0] = this.splitEdgeAcross(outerHE);  
      const tip = innerHE0.from;
      tip.d = {pos: fromPos};
      tips.push(tip);
      verticesByName[tip.name] = tip;

      const [innerHE1, outerHE1] = this.splitEdgeAcross(outerHE);
      const inward = innerHE1.from;
      inward.name = name;
      inward.d = {pos: innerPos};
      verticesByName[inward.name] = inward;
    }

    if (E3.normSquared(currentPos) > 1e-12) fail(
      `polygon not closed; offset: ${JSON.stringify(currentPos)}`
    );

    // remove dummy node
    this.contractEdge(outerHE);

    tips.forEach(tip => {
      let [he0, he1] = tip.halfEdgesOut();
      if (he0.loop === innerHE.loop) [he0, he1] = [he1, he0];
      tip.name = `[${he0.to.name}^${he1.to.name}]`;
    });
  }

  checkWithData() {
    this.check();

    function emitError(msg: string) {
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
            fail(`face ${loop} not flat (${vol}; ${vol.value("xyz")}): ${
              [v, v1, v2, v3].flatMap(vtx => ["\n ", vtx, vtx.d.pos]).join(", ")
            }`);
          }
        });
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
    const {vertices, loops} = this;
    for (const loop of loops) {
      log(loop, 
        "=", ...[...loop.halfEdges()].flatMap(he => [he, he.to]));
      log(`  ${!loop.d ? "???loop" : loop.d.isFace ? "face" : "boundary"}:`
        , ...[...loop.halfEdges()].map(he => he.to.name)
      );
    }
    for (const v of vertices) {
      const neighbors = [...v.neighbors()];
      log(
        v.toString().padEnd(15), v.firstHalfEdgeOut,
        v.d?.pos.toString().padEnd(50) ?? "MISSING",
        neighbors.length, "neighbors:", neighbors.join(" ").padEnd(35),
        "faces:", [...v.loops()].join(" "),
      );
    }
    const vertexArray = [...vertices];
    const nVertices = vertexArray.length;
    for (let i = 0; i < nVertices - 1; i++) {
      const vi = vertexArray[i];
      for (let j = i + 1; j < nVertices; j++) {
        const vj = vertexArray[j];
        const dist = distance(vi.d.pos, vj.d.pos);
        if (dist < 1e-4) log(`Nearby: ${vi}, ${vj} (${dist})`);
      }
    }
    log(`${
      vertices.size} vertices (${
      [...vertices].filter(v => v.name.includes("^")).length} tips), ${
      loops.size} loops (${
      [...loops].filter(l => l.d.isFace).length
    } faces)`);
    const edgeMessages: string[] = [];
    for (const l of loops) {
      if (!l.d.isFace) continue;
      for (const he of l.halfEdges()) {
        if (!he.twin.loop.d.isFace) continue;
        if (he.from.name > he.to.name) continue; // avoid duplicate output
        // TODO compute a directed angle (as seen when looking along the half-edge)?
        const angle = E3.getAngle(
          E3.normalize(E3.minus(
            he.next.to.d.pos,
            projectPointToLine(he.next.to.d.pos, he.from.d.pos, he.to.d.pos),
          )),
          E3.normalize(E3.minus(
            he.twin.next.to.d.pos,
            projectPointToLine(he.twin.next.to.d.pos, he.from.d.pos, he.to.d.pos),
          )),
        );
        edgeMessages.push(
          `${he.from.name}->${he.to.name}: ${(angle/TAU*360).toFixed(5)}° ${
            he.from} ==[${he}(${he.loop})|${he.twin}(${he.twin.loop})]==> ${he.to}`
        );
      }
    }
    log(edgeMessages.sort().join("\n"));
  }

  splitFace(face: Loop, p: Vertex, q: Vertex) {
    log("---------------------------------------------------------");
    log(`splitting ${face} along ${p.name}-${q.name}`)
    this.checkWithData();

    const halfEdges = [...face.halfEdges()];
    const [he0, he1] = this.splitLoop(
      halfEdges.find(he => he.to === p),
      halfEdges.find(he => he.to === q),
      {create: "right"}
    )
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
    const argVertices = args.map(name =>
      verticesByName[name] ?? fail(`no such vertex: ${name}`)
    );
    const [p, q, r] = argVertices;
    const face1 = findUniqueFace(p, q);
    log(`bend ${face1} along new edges ${p} - ${q}`);
    const face2 = findUniqueFace(q, r);
    log(`bend ${face2} along new edges ${q} - ${r}`);

    const he_q_tip1 = [...q.halfEdgesOut()].find(he => !he.loop.d.isFace);
    const he_tip1_q = he_q_tip1.twin;
    const tip1 = he_q_tip1.to;
    const he_tip2_q = [...q.halfEdgesIn ()].find(he => !he.loop.d.isFace);
    const he_q_tip2 = he_tip2_q.twin;
    const tip2 = he_tip2_q.from;

    log("points:", [p, tip1, q, tip2, r].map(point =>
      `\n  ${point.name}: ${point.d.pos.toString()}`
    ).join(""));

    this.splitFace(face1, p, q);
    this.splitFace(face2, q, r);

    const border = new Set([p, q, r]);
    const beyond_pq = collectVertices(tip1, border);
    const beyond_qr = collectVertices(tip2, border);
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

    log(`rotation ${p}-${q} ${projectPointToLine(tip1.d.pos, p.d.pos, q.d.pos)}[${tip1.d.pos} => ${inters1}]:`, ...beyond_pq);
    rotatePoints(projectPointToLine(tip1.d.pos, p.d.pos, q.d.pos), tip1.d.pos, inters1, [...beyond_pq].map(v => v.d));
    log(`rotation ${q}-${r} ${projectPointToLine(tip2.d.pos, q.d.pos, r.d.pos)}[${tip2.d.pos} => ${inters1}]:`, ...beyond_qr);
    rotatePoints(projectPointToLine(tip2.d.pos, q.d.pos, r.d.pos), tip2.d.pos, inters1, [...beyond_qr].map(v => v.d));
    const dist = distance(tip1.d.pos, tip2.d.pos);
    if (dist > 1e-8) fail(
      `vertices ${tip1} ${tip2} to merge too far apart: ${dist}`
    );

    this.mergeEdges(tip1, q, tip2);
    this.logMesh();
    this.checkWithData();

    const he_tip1_q_aux = findHE(tip1, q);
    log("compare", he_tip1_q === he_tip1_q_aux, he_tip1_q, he_tip1_q_aux);
    if (isBetweenCoplanarLoops(he_tip1_q_aux)) {
      // TODO create a test case for this situation
      log(`merging coplanar faces ${he_q_tip2.loop} and ${he_tip1_q_aux.loop}`);
      this.logMesh(); this.checkWithData();
      this.dropEdge(he_tip1_q_aux); // or he_q_tip2?
      log(`merged faces ${he_q_tip2.loop} into ${he_tip1_q_aux.loop}`);
    }
  }

  /**
   * Merge the two vertices tip1 and tip2 to tip := [tip1|tip2]
   * and the two edges tip1-q and tip2-q to tip-q.
  */
  mergeEdges(tip1: Vertex, q: Vertex, tip2: Vertex) {
    const he_tip1_q = findHE(tip1, q), he_q_tip1 = he_tip1_q.twin;
    const he_q_tip2 = findHE(q, tip2), he_tip2_q = he_q_tip2.twin;
    log(`Half edges ${he_tip2_q} and ${he_q_tip1} should become unreachable`);

    // TODO Let MeshG provide a method combining splitLoop and contractEdge?
    // This would avoid creating a temporary edge and a temporary loop.
    const tmpEdge = this.splitLoop(he_q_tip1, he_tip2_q.prev, {create: "left"});
    this.contractEdge(tmpEdge[0]);
    this.dropEdge(he_q_tip1);
    tip1.name =
      tip2.name === tip1.name + "'" ? tip1.name : `[${tip1.name}|${tip2.name}]`;

    this.logMesh();
    this.checkWithData();
  }

  reattachL(args: string[]) {
    const {loops, verticesByName} = this;

    if (args.length !== 2) fail(`reattachL expects 2 args`);
    const [pName, qName] = args;
    const p = verticesByName[pName] ?? fail(`no such vertex: ${pName}`);
    const q = verticesByName[qName] ?? fail(`no such vertexx: ${qName}`);
    const face = findUniqueFace(p, q);
    log(`cut ${face} along new edge ${p} - ${q} and re-attach it`);

    const he_face_p = [...p.halfEdgesIn()].find(he => he.loop === face);
    const he_face_q = [...q.halfEdgesIn()].find(he => he.loop === face);
    const [he_pq, he_qp] = this.splitLoop(he_face_p, he_face_q, {create: "right"});

    const [he_qp1, he_pq1] = this.splitLoop(he_pq, he_face_p, {create: "left"});
    const [he_pNew_p, he_p_pNew] = this.splitVertex(he_face_p.twin.prev, he_qp1, {create: "left"});
    he_p_pNew.to.name = p.name + "'";
    he_p_pNew.to.d = {pos: p.d.pos};
    this.dropEdge(he_p_pNew);

    rotatePoints(
      q.d.pos, he_face_q.from.d.pos, he_face_q.twin.prev.from.d.pos,
      [...collectVertices(he_face_q.from, new Set([p, q]))].map(v => v.d),
    );

    const [he_t1_t2, he_t2_t1] = this.splitLoop(he_face_q.twin, he_face_q.twin.prev.prev, {create: "left"});
    const he_q_t1 = he_t1_t2.prev;
    const he_t2_q = he_t1_t2.next;
    const t = this.contractEdge(he_t1_t2);
    t.name = `[${he_t1_t2.from.name}|${he_t1_t2.to.name}]`;
    this.dropEdge(he_q_t1);
    this.dropEdge(he_t2_q);
  }
}

function logEdge(name: string, he0: HalfEdge) {
  const he1 = he0.twin;
  log(`${name}: ${he0.prev}|${he1.next} ~ ${he1.to} ==[${he0}(${he0.loop}) | twin: ${he1}(${he1.loop})]==> ${he0.to} ~ ${he0.next}|${he1.prev}`);
}

/**
 * Find the face adjacent to all the given vertices.
 * Fail if there is no unique such face.
 */
function findUniqueFace(p: Vertex, q: Vertex) {
  const matchedFaces = [...p.loops()].filter(loop =>
    loop.d.isFace && [...loop.vertices()].includes(q)
  );
  if (matchedFaces.length !== 1) fail(
    `Expected 1 matching face adjacent to ${p} and ${q} but found ${
      matchedFaces.length}: {${matchedFaces.join(", ")}}`,
  );
  const [face] = matchedFaces
  log(`Found unique face ${face} adjacent to ${p} and ${q}`);
  // TODO Warn if there is already an edge from p to q?
  return face;
}

/**
 * Return the vertices reachable from start without crossing the border.
 */
function collectVertices(start: Vertex, border: Set<Vertex>): Set<Vertex> {
  log(`collecting from ${start} to`, ...border);
  const collected = new Set<Vertex>();
  function recur(v: Vertex) {
    if (border.has(v) || collected.has(v)) return;
    collected.add(v);
    [...v.neighbors()].forEach(recur);
  }
  recur(start);
  log(`collected: {${[...collected].join(", ")}}`);
  return collected;
}

const cmdNames = ["bend2", "reattachL", "reattachR"];
