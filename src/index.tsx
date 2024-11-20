import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import * as B from '@babylonjs/core';
import { Vector3 as V3 } from '@babylonjs/core';
import * as G from "@babylonjs/gui";

import './style.css';
import { assert, choose, count, fail, findUnique, getLines, log, setLogger } from './utils';
import { closeTo0, distance, XYZ, intersect3Spheres, MV, projectPointToLine, rotatePoints, rotXY60, TAU } from './geom-utils';
import { findHE, HalfEdgeG, LoopG, MeshG, VertexG } from './mesh';
import { initialActionsDef, initialPolygonDef } from './init';
import triangulate from './triangulate';

const v3 = (...args: number[]) => new V3(...args);
const mvToV3 = (mv: MV) => v3(mv.value("x"), mv.value("y"), mv.value("z"));
const vtxToV3 = (v: Vertex) => mvToV3(v.d.pos);

type PhaseData = {
  logTitle: string;
  logText: string;
  error?: string;

  /** Contains (x,y,z) triplets of coordinates */
  vertices: V3[],
  vertexNames: string[],
  edges: [V3, V3][],
  triangles: V3[][],
}

export function App() {
  const polygonDefElem = useRef<HTMLTextAreaElement>();
  const actionsDefElem = useRef<HTMLTextAreaElement>();
  const phaseSelectElem = useRef<HTMLSelectElement>();

  const [phases, setPhases] = useState<PhaseData[]>([]);
  const [phaseNo, setPhaseNo] = useState(0);
  const [showVertices, setShowVertices] = useState(true);
  const [showVertexNames, setShowVertexNames] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showFaces, setShowFaces] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const canvas = useRef<HTMLCanvasElement>();

  function run() {
    const phasesList: PhaseData[] = [];

    const polygonDef = polygonDefElem.current.value;
    const actionsDef = actionsDefElem.current.value;

    let logText = "";
    let error = null;
    const log = (...args: any[]) => { logText += args.join(" ") + "\n"; };
    setLogger(log);
    let mesh = new Mesh(log, fail);

    function emitPhase(logTitle: string) {
      console.log("emitting phase:", logTitle);
      const {vertices, loops} = mesh;
      phasesList.push({
        logTitle, logText, error,
        vertices: vertices.values().map(vtxToV3).toArray(),
        vertexNames: vertices.values().map(v => v.name).toArray(),
        edges: vertices.values().flatMap(v =>
          v.neighbors().filter(w => v.id <= w.id)
          .map(w => [vtxToV3(v), vtxToV3(w)] as [V3, V3])
        ).toArray(),
        triangles: loops.values().filter(l => l !== mesh.boundary).flatMap(l =>
          triangulate(l.vertices().map(v => v.d.pos).toArray())
          .map(triangle => triangle.map(mvToV3))
        ).toArray(),
      });
    }

    createPhases: {
      try {
        mesh.setup(polygonDef);
        mesh.logMesh();
        mesh.checkWithData();
      } catch (e) {
        error = e.toString();
        log("CAUGHT EXCEPTION:", e);
        break createPhases;
      }
      finally {
        emitPhase("initialize")
      }

      for (const line of getLines(actionsDef)) {
        logText = "";
        try {
          const [cmd, ...args] = line.trim().split(/\s+/);
          if (!cmdNames.includes(cmd)) fail(`Unknown command "${cmd}"`);
          mesh[cmd](args);
          mesh.logMesh();
          mesh.checkWithData();
        } catch (e) {
          error = e.toString();
          log("CAUGHT EXCEPTION:", e, "\nstack:\n" + e.stack);
          break createPhases;
        } finally {
          emitPhase(line);
        }
      }
    }

    setPhases(phasesList);
    setPhaseNo(phasesList.length - 1);
  }

  useEffect(() => {
    if (canvas.current && phases.length > 0) {
      const {vertices, vertexNames, edges, triangles} = phases[phaseNo];
      return renderToCanvas(
        canvas.current,
        vertices, vertexNames, edges, triangles,
        showVertices, showVertexNames, showEdges, showFaces, showGrid,
      );
    }
  }, [
    canvas.current, phases, phaseNo,
    showVertices, showVertexNames, showEdges, showFaces, showGrid,
  ]);

  useEffect(run, []);

  useEffect(() => {
    phaseSelectElem.current?.focus();
  }, [phases, phaseSelectElem.current]);

  return (
    <>
      <div style={{display: "flex"}}>
        <div style={{width: "fit-content"}}>
          <textarea ref={polygonDefElem}>
            {initialPolygonDef.trim()}
          </textarea>
          <br/>
          <textarea ref={actionsDefElem}>
            {initialActionsDef.trim()}
          </textarea>
          <br/>
          <button onClick={run}>run</button>
          {phases.length > 0 && (
            <div class="display-controls">
              {
                phases.at(-1).error
                ? <a href={`#phase-${phases.length}`}>Failure at step #{phases.length}</a>
                : `${phases.length} step${phases.length === 1 ? "" : "s"} succeeded`
              }
              <br/>
              <label>
                Select step:
                <br/>
                <select
                  ref={phaseSelectElem}
                  onChange={e => setPhaseNo(e.target["value"])}
                >
                  {phases.map((phaseData, i) => (
                    <option selected={phaseNo === i} value={i}>
                      {i+1}. {phaseData.logTitle}
                    </option>
                  ))}
                </select>
              </label> {}
              <br/>
              Show...
              <br/>
              <label>
                <input type="checkbox"
                  checked={showVertices}
                  onChange={e => setShowVertices(e.target["checked"])}
                /> {}
                vertices
              </label>
              <br/>
              <label>
                <input type="checkbox"
                  checked={showVertexNames}
                  onChange={e => setShowVertexNames(e.target["checked"])}
                /> {}
                vertex names
              </label>
              <br/>
              <label>
                <input type="checkbox"
                  checked={showEdges}
                  onChange={e => setShowEdges(e.target["checked"])}
                /> {}
                edges
              </label>
              <br/>
              <label>
                <input type="checkbox"
                  checked={showFaces}
                  onChange={e => setShowFaces(e.target["checked"])}
                /> {}
                faces
              </label>
              <br/>
              <label>
                <input type="checkbox"
                  checked={showGrid}
                  onChange={e => setShowGrid(e.target["checked"])}
                /> {}
                grid
              </label>
            </div>
          )}
        </div>
        <canvas ref={canvas}/>
      </div>
      <div class="output" style={{width: "fit-content"}}>
        {phases.map(({error, logTitle, logText}, i) => (
          <div className="phase" style={`background: #${error ? "fee" : "efe"};`}>
            <details open={Boolean(error)} id={`phase-${i+1}`}>
              <summary><code>{i+1}. {logTitle}</code></summary>
              <pre>{logText}</pre>
            </details>
          </div>
        ))}
      </div>
    </>
  );
}

function renderToCanvas(
  canvas: HTMLCanvasElement,
  vertices: V3[],
  vertexNames: string[],
  edges: [V3, V3][],
  triangles: V3[][],
  showVertices: boolean,
  showVertexNames: boolean,
  showEdges: boolean,
  showFaces: boolean,
  showGrid: boolean,
) {
  const noBubble = (e: Event) => e.preventDefault();
  canvas.addEventListener("wheel", noBubble);

  const engine = new B.Engine(canvas, true);
  const scene = new B.Scene(engine);

  const advancedTexture = G.AdvancedDynamicTexture.CreateFullscreenUI("myUI", true, scene);
  advancedTexture.rootContainer.scaleX = window.devicePixelRatio;
  advancedTexture.rootContainer.scaleY = window.devicePixelRatio;
  
  const tipMaterial = new B.StandardMaterial("myMaterial", scene);
  tipMaterial.diffuseColor = B.Color3.Blue();

  const innerMaterial = new B.StandardMaterial("myMaterial", scene);
  innerMaterial.diffuseColor = B.Color3.Red();

  const lineMaterial = new B.StandardMaterial("myMaterial", scene);
  lineMaterial.diffuseColor = B.Color3.Green();

  const faceMaterial = new B.StandardMaterial("myMaterial", scene);
  faceMaterial.diffuseColor = B.Color3.Yellow();
  faceMaterial.roughness = 100;
  faceMaterial.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  faceMaterial.alpha = 0.3;
  // faceMaterial.wireframe = true;
  faceMaterial.sideOrientation = B.VertexData.DOUBLESIDE;
  faceMaterial.backFaceCulling = false;

  const gridMaterial = new B.StandardMaterial("myMaterial", scene);
  gridMaterial.diffuseColor = B.Color3.Black();

  const center = vertices
    .reduce((acc, v) => acc.addInPlace(v), V3.Zero())
    .scaleInPlace(1 / vertices.length);

  const root = new B.TransformNode("root", scene);
  root.position = center.negate();

  if (showVertices) {
    vertices.forEach((pos, i) => {
      const ball = B.MeshBuilder.CreateIcoSphere("vtx" + i, {radius: .05});
      ball.position = pos;
      ball.parent = root;
      ball.material = vertexNames[i].includes("^") ? tipMaterial : innerMaterial;
    });
  }
  if (showVertexNames) {
    vertices.forEach((pos, i) => {
      const labelText = vertexNames[i];
      if (labelText.includes("^")) return;
      const labelPos = new B.TransformNode("labelPos" + i, scene);
      labelPos.parent = root;
      labelPos.position = v3(0, .2, 0).addInPlace(pos);
      const label = new G.TextBlock("label" + i, labelText);
      label.color = "#fff";
      label.fontSize = 16;
      advancedTexture.addControl(label);
      label.linkWithMesh(labelPos);
    });
  }
  if (showEdges) {
    edges.forEach((path, i) => {
      const line = B.MeshBuilder.CreateTube("line" + i, {path, radius: .02});
      line.material = lineMaterial;
      line.parent = root;
    });
  }
  if (showFaces) {
    triangles.forEach((triangle, i) => {
      const mesh = new B.Mesh("triangle" + i, scene);
      const vertexData = new B.VertexData();
      vertexData.positions = triangle.flatMap(v => v.asArray());
      vertexData.indices = [0,1,2];
      vertexData.applyToMesh(mesh);
      mesh.material = faceMaterial;
      mesh.parent = root;
    });
  }

  if (showGrid) {
    for (let i = -12; i < 4; i++) {
      for (const [skewDown, skewUp] of [[0,0], [0.5, 0.5], [-5,+5], [+5,-5]]) {
        const line = B.MeshBuilder.CreateTube("grid", {
          path: [
            v3((i+skewDown)*r3, -5, 0),
            v3((i+skewUp  )*r3, +5, 0),
          ],
          radius: 0.005,
        });
        line.material = gridMaterial;
        line.parent = root;
      }
    }
  }

  const camera = new B.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2, 10, v3(0, 0, 0), scene);
  camera.lowerRadiusLimit = 3;
  camera.upperRadiusLimit = 30;
  camera.attachControl(canvas, true);

  [
    [v3( 10,  10,   0)],
    [v3(-10, -10,  10)],
    [v3(-10,   0, -10)],
    [v3(  0, -10, -10)],
    [v3( 10,   0,  10)],
    [v3( 10,   0,   0)],
  ].forEach(([pos], i) => {
    const l = new B.PointLight("light" + i, pos, scene);
    l.radius = 5;
  });

  if (false) [[1,0,0], [0,1,0], [0,0,1]].forEach(([x,y,z], i) => {
    const axis = B.MeshBuilder.CreateTube("axis" + i, {
      path: [new V3(), new V3(x,y,z).scaleInPlace(5)],
      radius: 0.02,
    }, scene);
    const material = new B.StandardMaterial("axisMat" + i, scene);
    material.diffuseColor = new B.Color3(x,y,z);
    axis.material = material;
  });

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
  "12": XYZ.vec([ 0 * r3half,  2 / 2, 0]),
   "1": XYZ.vec([ 1 * r3half,  3 / 2, 0]),
   "2": XYZ.vec([ 1 * r3half,  1 / 2, 0]),
   "3": XYZ.vec([ 2 * r3half,  0 / 2, 0]),
   "4": XYZ.vec([ 1 * r3half, -1 / 2, 0]),
   "5": XYZ.vec([ 1 * r3half, -3 / 2, 0]),
   "6": XYZ.vec([ 0 * r3half, -2 / 2, 0]),
   "7": XYZ.vec([-1 * r3half, -3 / 2, 0]),
   "8": XYZ.vec([-1 * r3half, -1 / 2, 0]),
   "9": XYZ.vec([-2 * r3half,  0 / 2, 0]),
  "10": XYZ.vec([-1 * r3half,  1 / 2, 0]),
  "11": XYZ.vec([-1 * r3half,  3 / 2, 0]),
};


type VData = { pos: MV };
type LData = void;
type EData = void;
type Loop = LoopG<VData, LData, EData>;
type Vertex = VertexG<VData, LData, EData>;
type HalfEdge = HalfEdgeG<VData, LData, EData>;

/**
 * Would merging the two loops adjacent to `he` and its twin result
 * in a flat loop?
 */
function isBetweenCoplanarLoops(he: HalfEdge): boolean {
  assert(isLoopFlat(he.loop));
  assert(isLoopFlat(he.twin.loop));
  // Assuming that each of the two loops is already flat, we only need to
  // check if they have the same normalized directed areas.
  // If one of the loops is degenerated, the union is flat as well.
  const a1 = directedArea(he.loop), a2 = directedArea(he.twin.loop);
  const a1n = XYZ.norm(a1), a2n = XYZ.norm(a2);
  return (
    a1n < 1e-8 || a2n < 1e-8 ||
    closeTo0(XYZ.minus(XYZ.scale(1/a1n, a1), XYZ.scale(1/a2n, a2)))
  );
}

class Mesh extends MeshG<VData, LData, EData> {
  boundary: Loop;

  constructor(
    log: (...args: any[]) => unknown,
    fail: (msg: string) => never,
  ) {
    super(log, fail);
  }

  setup(def: string) {
    const [innerHE, outerHE] = this.addCore();
    this.boundary = outerHE.loop
    Object.assign(innerHE.loop, {name: "star"});
    Object.assign(outerHE.loop, {name: "boundary"});
    Object.assign(innerHE.to, {name: "dummy", d: {pos: XYZ.vec([0, 0, 0])}});
    this.logMesh();
    this.checkWithData();

    let currentPos = XYZ.vec([0, 0, 0]);
    let tips: Vertex[] = [];

    for (const line of getLines(def)) {
      const [name, ...moves] = line.split(/\s+/);
      const fromPos = currentPos;
      for (const move of moves) {
        currentPos = XYZ.plus(currentPos, steps[move] ?? fail(`unknown step: ${move}`))
      }
      const innerPos = XYZ.plus(fromPos, rotXY60(XYZ.minus(currentPos, fromPos)));

      const [innerHE0, outerHE0] = this.splitEdgeAcross(outerHE);  
      const tip = innerHE0.from;
      tip.d = {pos: fromPos};
      tips.push(tip);

      const [innerHE1, outerHE1] = this.splitEdgeAcross(outerHE);
      const inward = innerHE1.from;
      inward.name = name;
      inward.d = {pos: innerPos};
    }

    if (XYZ.normSquared(currentPos) > 1e-12) fail(
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

    for (const loop of this.loops) {
      if (loop !== this.boundary && !isLoopFlat(loop)) {
        fail(`face ${loop} not flat`);
      }
    }
    for (const vertex of this.vertices) {
      let i = 0;
      for (const he of vertex.halfEdgesOut()) {
        if (i > 50) {
          fail(`neighborhood of vertex ${vertex} too long`)
        }
        if (he.from !== vertex) {
          fail(`${he}: he.from ${he.from} should be ${vertex} (he: ${he}, he.to: ${he.to})`);
        }
      }
    }
    this.checkPeers();
    log("mesh checked");
  }

  /**
   * Check boundary "combinability".
   * 
   * Divide the boundary into sections separated by tip vertices.
   * Each section should have an even number of edges and the section should
   * be symmetric regarding the edge lengths.
   */
  checkPeers(): void {
    const startHE = this.boundary.halfEdges().find(v => v.from.name.includes("^"));
    if (!startHE) return; // apparently there aren't any tip vertices yet.
    let count = 0, he = startHE, section = [];
    do {
      section.push(he);
      if (he.to.name.includes("^")) {
        assert(section.length % 2 === 0);
        for (let i1 = 0, i2 = section.length - 1; i1 < i2; i1++, i2--) {
          const he1 = section[i1], he2 = section[i2];
          const l1 = heLength(he1), l2 = heLength(he2);
          if (Math.abs(l1 - l2) > 1e-8) fail(
            `boundary edges ${he1.from.name} --- ${he1.to.name}, ${he2.to.name} --- ${he2.from.name} have different lengths: ${l1}, ${l2}`
          );
          // log(
          //   `boundary edges ${he1.from.name} --- ${he1.to.name}, ${he2.to.name} --- ${he2.from.name} have identical length ${l1.toFixed(5)}`
          // );
        }
        section = [];
      }
      if (++count >= 50) fail(`edge-length loop ran away`);
    } while ((he = he.next) !== startHE);
  }

  logMesh() {
    const {vertices, loops} = this;
    for (const l of loops) {
      log(l, "=", ...[...l.halfEdges()].flatMap(he => [he, he.to]));
      log(`  = (${count(l.halfEdges())}):`, ...[...l.halfEdges()].map(he => he.to.name));
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
    for (const [vi, vj] of choose([...vertices], 2)) {
      const dist = distance(vi.d.pos, vj.d.pos);
      if (dist < 1e-4) log(`Nearby: ${vi}, ${vj} (${dist})`);
    }
    log(`${
      vertices.size} vertices (${
      count(vertices.values().filter(v => v.name.includes("^")))} tips), ${
      loops.size} loops (${
      [...loops].filter(l => l !== this.boundary).length
    } faces)`);
    const edgeMessages: string[] = [];
    for (const l of loops) {
      if (l === this.boundary) continue;
      for (const he of l.halfEdges()) {
        if (he.twin.loop === this.boundary) continue;
        if (he.from.name > he.to.name) continue; // avoid duplicate output
        // TODO compute a directed angle (as seen when looking along the half-edge)?
        const angle = XYZ.getAngle(faceOrientation(he), faceOrientation(he.twin));
        edgeMessages.push(
          `${he.from.name}->${he.to.name}: ${(angle/TAU*360).toFixed(5)}° ${
            he.from} ==[${he}(${he.loop})|${he.twin}(${he.twin.loop})]==> ${he.to}`
        );
      }
    }
    log(edgeMessages.sort().join("\n"));
  }

  bend2(args: string[]) {
    const {vertices} = this;

    if (args.length !== 4) fail("bend2 expects 4 args");
    const choice = args.shift();
    if (!["+", "-"].includes(choice)) fail(
      "first arg of bend2 should be '+' or '-'."
    );
    const [p, q, r] = args.map(name => {
      const found = vertices.values().filter(v => v.name === name).toArray();
      if (found.length !== 1) fail(
        `found ${found.length} vertices with name "${name}".`
      );
      const v = found[0];
      if (!v.loops().some(l => l === this.boundary)) fail(
        `vertex ${v} is not adjacent to the boundary.`
      );
      return v;
    });

    const he_q_boundary =
      findUnique(q.halfEdgesOut(), he => he.loop === this.boundary);
    const he_boundary_q = he_q_boundary.prev;

    const t1 = he_q_boundary.to;
    const t2 = he_boundary_q.from;

    // Use new names {s1, s2} for {p, r} in such a way that walking on the
    // boundary counterclockwise (and thus against the half-edge directions)
    // will reach the vertices in the order s1->q->s2->s1.
    let s1: Vertex, s2: Vertex;
    for (let count = 0, he = he_q_boundary; ; count++, he = he.next) {
      if (count > 50) fail("runaway search loop");
      if (he.to === p) { s1 = p; s2 = r; break; }
      if (he.to === r) { s1 = r; s2 = p; break; }
    }

    const face1 = this.findUniqueFace(s1, q);
    const face2 = this.findUniqueFace(q, s1);

    const border = new Set([s1, q, s2]);
    const beyond1 = collectVertices(t1, border);
    const beyond2 = collectVertices(t2, border);
    assert(beyond1.isDisjointFrom(beyond2));

    this.splitLoop(
      findUnique(face1.halfEdges(), he => he.to === q),
      findUnique(face1.halfEdges(), he => he.to === s1),
      {create: "left"}
    )[0].loop.name = `split(${q.name}-${s1.name})`;

    this.splitLoop(
      findUnique(face2.halfEdges(), he => he.to === s2),
      findUnique(face2.halfEdges(), he => he.to === q),
      {create: "left"}
    )[0].loop.name = `split(${q.name}-${s2.name})`;

    const [inters1 , inters2] = intersect3Spheres(
      s1.d.pos, t1.d.pos,
      q.d.pos, t1/* or t2 */.d.pos,
      s2.d.pos, t2.d.pos,
    );
    const inters = choice === "+" ? inters2 : inters1;

    // TODO simplify geometry?
    rotatePoints(projectPointToLine(t1.d.pos, s1.d.pos, q.d.pos), t1.d.pos, inters, beyond1.values().map(v => v.d));
    rotatePoints(projectPointToLine(t2.d.pos, s2.d.pos, q.d.pos), t2.d.pos, inters, beyond2.values().map(v => v.d));
    assert(distance(t1.d.pos, t2.d.pos) < 1e-8);

    // TODO Let MeshG provide a method combining splitLoop and contractEdge?
    // This would avoid creating a temporary edge and a temporary loop.
    const tmpEdge = this.splitLoop(he_q_boundary, he_boundary_q.prev, {create: "left"});
    this.contractEdge(tmpEdge[0]);
    this.dropEdge(he_q_boundary);
    t1.name = mergeNames(t2.name, t1.name);

    const he_tip1_q_aux = findHE(t1, q);
    if (isBetweenCoplanarLoops(he_tip1_q_aux)) {
      // TODO create a test case for this situation
      this.dropEdge(he_tip1_q_aux); 
    }
  }

  reattach(args: string[]) {
    const {vertices} = this;

    if (args.length !== 2) fail(`reattach expects 2 args`);
    const [pName, qName] = args;
    const p = findUnique(vertices, v => v.name === pName);
    const q = findUnique(vertices, v => v.name === qName);
    const face = this.findUniqueFace(p, q);
    const he_face_p = findUnique(p.halfEdgesIn(), he => he.loop === face);
    const he_face_q = findUnique(q.halfEdgesIn(), he => he.loop === face);
    const he_boundary_p = findUnique([...p.halfEdgesIn()], he => he.loop === this.boundary);
    const he_boundary_q = findUnique([...q.halfEdgesIn()], he => he.loop === this.boundary);
    const he_q_boundary = he_boundary_q.next;
    const t1 = he_boundary_q.from;
    const t2 = he_q_boundary.to;
    assert(Math.abs(distance(t1.d.pos, q.d.pos) - distance(t2.d.pos, q.d.pos)) < 1e-8);

    const [he_pq_A, he_qp_A] = this.splitLoop(he_face_p, he_face_q, {create: "right"});
    const [he_qp_B, he_pq_B] = this.splitLoop(he_pq_A, he_face_p, {create: "left"});
    log("AB", he_qp_A.loop.name, he_qp_A.loop.d, he_qp_B.loop.name, he_qp_B.loop.d);
    const [he_p0_p1, he_p1_p0] = this.splitVertex(he_qp_B, he_boundary_p, {create: "both"});
    he_p0_p1.from.d = {pos: p.d.pos};
    he_p0_p1.to.d = {pos: p.d.pos};
    vertices.delete(p);
    this.dropEdge(he_p0_p1);

    // Now we have cut through p and face.  The two pieces should be connected
    // only at q.

    log("reattach info:",
      Object.entries({p, q, t1, t2, he_p0_p1}).map(([k, v]) => `${k} = ${v}`).join("; "),
      face, `{${face.vertices().toArray().join(" ")}}`,
    );

    const separator = new Set([q]);
    const part1 = collectVertices(t1, separator);
    const part2 = collectVertices(t2, separator);
    assert(part1.isDisjointFrom(part2));
    assert(part1.has(t1));
    assert(part2.has(t2));

    const [fromV, toV, fromHE, toHE, part] =
      part1.size <= part2.size
      ? [t1, t2, he_boundary_q, he_q_boundary, part1]
      : [t2, t1, he_q_boundary, he_boundary_q, part2];

    // q is not moved by reattachment.  So it is already in the right place.
    // The following rotation of the snippet vertices ensures
    // - that edges q-t1 and q-t2 coincide and
    // - that the snippet fits with q and pNew (instead of p):
    log("before rot1", q, q.d.pos, fromV, fromV.d.pos, toV, toV.d.pos,
      "dist:", distance(fromV.d.pos, toV.d.pos),
      `{${part.values().map(v => v.d.pos).toArray().join(" ")}}`);
    rotatePoints(q.d.pos, fromV.d.pos, toV.d.pos, part.values().map(v => v.d));
    log("after rot1", q, q.d.pos, fromV, fromV.d.pos, toV, toV.d.pos,
      `{${part.values().map(v => v.d.pos).toArray().join(" ")}}`);
    assert(closeTo0(XYZ.minus(fromV.d.pos, toV.d.pos)));
    // But still the two faces behind q-t1 and q-t2 might not be in a plane.
    // So we perform another rotation of the snippet around the newly
    // coinciding edges:
    rotatePoints(
      q.d.pos,
      // TODO Avoid adding q.d.pos, which is subtracted immediately inside rotatePoints(...)
      XYZ.plus(q.d.pos, faceOrientation(fromHE.twin)),
      XYZ.plus(q.d.pos, XYZ.negate(faceOrientation(toHE.twin))),
      part.values().map(v => v.d),
    );
    log("after rot2", q, q.d.pos, fromV, fromV.d.pos, toV, toV.d.pos,
      `{${part.values().map(v => v.d.pos).toArray().join(" ")}}`);

    const [he_t1_t2, he_t2_t1] =
      this.splitLoop(he_q_boundary, he_q_boundary.prev.prev, {create: "left"});
    const t = this.contractEdge(he_t1_t2);
    t.name = mergeNames(he_t1_t2.from.name, he_t1_t2.to.name);
    this.dropEdge(he_q_boundary);
    if (!isBetweenCoplanarLoops(he_boundary_q)) fail(
      `faces not coplanar: ${he_boundary_q.loop} and ${he_boundary_q.twin}`
    );
    this.dropEdge(he_boundary_q);
    // TODO If more pairs of edges/vertices happen to align, merge them.
  }

  /**
   * Find the (unique) face adjacent to all the given vertices.
   */
  findUniqueFace(p: Vertex, q: Vertex) {
    const found = p.loops().filter(l =>
      l !== this.boundary && l.vertices().some(v => v === q)
    ).toArray();
    if (found.length !== 1) fail(
      `found ${found.length} faces with vertices ${p} and ${q}: {${found.join(" ")}}.`
    );
    return found[0];
  }
}

const heLength = (he: HalfEdge) => distance(he.from.d.pos, he.to.d.pos);

function isLoopFlat(loop: Loop) {
  // This is a bit too optimistic:  A non-flat loop with total area 0 will be
  // reported as flat.
  const a = directedArea(loop);
  for (const {from, to} of loop.halfEdges()) {
    if (!closeTo0(XYZ.wedgeProduct(a, XYZ.minus(to.d.pos, from.d.pos)))) {
      return false;
    }
  }
  return true;
}

/**
 * Return a vector
 * - parallel to the plane of `he.loop` and
 * - orthogonal to the direction of `he`.
 * 
 * (It does not matter if the result points from the half edge into the loop or
 * in the opposite direction.  Consistent behavior suffices.)
 */
const faceOrientation = (he: HalfEdge) =>
  XYZ.contractLeft(XYZ.minus(he.to.d.pos, he.from.d.pos), directedArea(he.loop));

const directedArea = (loop: Loop) => loop.halfEdges().reduce(
  (acc, {from, to}) => XYZ.plus(acc, XYZ.wedgeProduct(from.d.pos, to.d.pos)),
  XYZ.zero(),
);

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

const cmdNames = ["bend2", "reattach"];

const mergeNames = (a: string, b: string) =>
  (a.endsWith(".0") || a.endsWith(".1")) &&
  (b.endsWith(".0") || b.endsWith(".1")) &&
  a.slice(0, -2) === b.slice(0, -2) &&
  a !== b
  ? a.slice(0, -2)
  : `[${a}|${b}]`