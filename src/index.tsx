import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import * as B from '@babylonjs/core';
import { Vector3 as V3 } from '@babylonjs/core';
import * as G from "@babylonjs/gui";

import './style.css';
import { assert, choose, count, fail, findUnique, getLines, log, setLogger } from './utils';
import { closeTo0, distance, XYZ, intersect3Spheres, MV, projectPointToLine, rotatePoints, rotXY60, TAU } from './geom-utils';
import { findHE, HalfEdge, Loop, Mesh, Vertex } from './mesh';
import examples from './examples';
import triangulate from './triangulate';

const v3 = (...args: number[]) => new V3(...args);
const mvToV3 = (mv: MV) => v3(mv.value("x"), mv.value("y"), mv.value("z"));

type PhaseData = {
  logTitle: string;
  logText: string;
  error?: string;

  /** Contains (x,y,z) triplets of coordinates */
  vertices: V3[],
  vertexNames: string[],
  edges: [V3, V3][],
  triangles: V3[][],
  peers: [V3, V3][],
}

const cmdNames = ["bend", "bend2", "reattach", "contract"];

export function App() {
  const [example, setExample] = useState<string>("thurston");
  const [phases, setPhases] = useState<PhaseData[]>([]);
  const [phaseNo, setPhaseNo] = useState(0);
  const [showVertices, setShowVertices] = useState(true);
  const [showVertexNames, setShowVertexNames] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showFaces, setShowFaces] = useState(true);
  const [showPeers, setShowPeers] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  const polygonDefElem = useRef<HTMLTextAreaElement>();
  const actionsDefElem = useRef<HTMLTextAreaElement>();
  const phaseSelectElem = useRef<HTMLSelectElement>();
  const canvas = useRef<HTMLCanvasElement>();

  function run() {
    const phasesList: PhaseData[] = [];

    const polygonDef = polygonDefElem.current.value;
    const actionsDef = actionsDefElem.current.value;

    let logText = "";
    let error = null;
    const log = (...args: any[]) => { logText += args.join(" ") + "\n"; };
    setLogger(log);
    const mesh = new MyMesh(log, fail);

    function emitPhase(logTitle: string) {
      console.log("emitting phase:", logTitle);
      const {vertices, loops, boundary, peers, pos, heCenter} = mesh;
      const vtxToV3 = (v: Vertex) => mvToV3(pos(v));
      phasesList.push({
        logTitle, logText, error,
        vertices: vertices.values().map(vtxToV3).toArray(),
        vertexNames: vertices.values().map(v => v.name).toArray(),
        edges: vertices.values().flatMap(v =>
          v.neighbors().filter(w => v.id <= w.id)
          .map(w => [vtxToV3(v), vtxToV3(w)] as [V3, V3])
        ).toArray(),
        triangles: loops.values().filter(l => l !== mesh.boundary).flatMap(l =>
          triangulate(l.vertices().map(v => pos(v)).toArray())
          .map(triangle => triangle.map(mvToV3))
        ).toArray(),
        peers:
          peers.entries().filter(([he0, he1]) => he0.id <= he1.id)
          .map(([he0, he1]) =>
            [mvToV3(heCenter(he0)), mvToV3(heCenter(he1))] as [V3, V3]
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
      const {vertices, vertexNames, edges, triangles, peers} = phases[phaseNo];
      return renderToCanvas(
        canvas.current,
        vertices, vertexNames, edges, triangles, peers,
        showVertices, showVertexNames, showEdges, showFaces, showPeers, showGrid,
      );
    }
  }, [
    canvas.current, phases, phaseNo,
    showVertices, showVertexNames, showEdges, showFaces, showPeers, showGrid,
  ]);

  useEffect(run, []);

  useEffect(() => {
    phaseSelectElem.current?.focus();
  }, [phases, phaseSelectElem.current]);

  return (
    <>
      <div style={{display: "flex"}}>
        <div style={{minWidth: "400px"}}>
          <div className="with-margin">
            See the README file of
            {} <a href="https://github.com/hcschuetz/star-folding/" target="_blank" rel="noopener noreferrer">
              this project
            </a>
            <br/>
            for usage instructions.
          </div>
          <div class="with-margin">
            Select example: {}
            <select onChange={e => setExample(e.target["value"])}>
              {Object.entries(examples).map(([key, value]) => (
                <option selected={example === key} value={key}>
                  {value.label ?? key}
                </option>
              ))}
            </select>
            <details>
              <summary>example info</summary>
              {examples[example].info.trim()}
            </details>
          </div>
          <textarea ref={polygonDefElem} rows={20} cols={10}>
            {examples[example].setup.trim()}
          </textarea>
          <textarea ref={actionsDefElem} rows={20} cols={35}>
            {examples[example].transform.trim()}
          </textarea>
          <br/>
          <button onClick={run}>run</button>
          {phases.length > 0 && (
            <div class="with-margin">
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
                  checked={showPeers}
                  onChange={e => setShowPeers(e.target["checked"])}
                /> {}
                peers
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
      <div class="with-margin" style={{width: "fit-content"}}>
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
  peers: [V3, V3][],
  showVertices: boolean,
  showVertexNames: boolean,
  showEdges: boolean,
  showFaces: boolean,
  showPeers: boolean,
  showGrid: boolean,
) {
  const noBubble = (e: Event) => e.preventDefault();
  canvas.addEventListener("wheel", noBubble);

  const engine = new B.Engine(canvas, true);
  const scene = new B.Scene(engine);

  const advancedTexture = G.AdvancedDynamicTexture.CreateFullscreenUI("myUI", true, scene);
  advancedTexture.rootContainer.scaleX = window.devicePixelRatio;
  advancedTexture.rootContainer.scaleY = window.devicePixelRatio;
  
  const tipMaterial = new B.StandardMaterial("tipMaterial", scene);
  tipMaterial.diffuseColor = B.Color3.Red();

  const innerMaterial = new B.StandardMaterial("innerMaterial", scene);
  innerMaterial.diffuseColor = B.Color3.Blue();

  const edgeMaterial = new B.StandardMaterial("edgeMaterial", scene);
  edgeMaterial.diffuseColor = B.Color3.Green();

  const peerMaterial = new B.StandardMaterial("peerMaterial", scene);
  peerMaterial.diffuseColor = B.Color3.Red();
  peerMaterial.roughness = 100;
  peerMaterial.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  peerMaterial.alpha = 0.5;

  const faceMaterial = new B.StandardMaterial("faceMaterial", scene);
  faceMaterial.diffuseColor = B.Color3.Yellow();
  faceMaterial.roughness = 100;
  faceMaterial.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  faceMaterial.alpha = 0.6;
  // faceMaterial.wireframe = true;
  faceMaterial.sideOrientation = B.VertexData.DOUBLESIDE;
  faceMaterial.backFaceCulling = false;

  const gridMaterial = new B.StandardMaterial("gridMaterial", scene);
  gridMaterial.diffuseColor = B.Color3.Black();

  const center = vertices
    .reduce((acc, v) => acc.addInPlace(v), V3.Zero())
    .scaleInPlace(1 / vertices.length);

  const root = new B.TransformNode("root", scene);
  root.position = center.negate();

  if (showVertices) {
    vertices.forEach((pos, i) => {
      const ball = B.MeshBuilder.CreateIcoSphere("vtx" + i, {radius: .03});
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
      const line = B.MeshBuilder.CreateTube("line" + i, {path, radius: .01});
      line.material = edgeMaterial;
      line.parent = root;
    });
  }
  if (showPeers) {
    peers.forEach((path, i) => {
      const line = B.MeshBuilder.CreateTube("line" + i, {path, radius: .01});
      line.material = peerMaterial;
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


class MyMesh extends Mesh {
  boundary: Loop;
  positions = new WeakMap<Vertex, MV>();
  setPos = (v: Vertex, pos: MV) => this.positions.set(v, pos);
  pos = (v: Vertex) => this.positions.get(v);

  // TODO make this a WeakMap?
  peers = new Map<HalfEdge, HalfEdge>();

  constructor(
    log: (...args: any[]) => unknown,
    fail: (msg: string) => never,
  ) {
    super(log, fail);
  }

  setup(def: string) {
    const [innerHE, outerHE] = this.addCore();
    this.boundary = outerHE.loop
    innerHE.loop.name = "star";
    outerHE.loop.name = "boundary";
    innerHE.to.name = "dummy";
    this.setPos(innerHE.to, XYZ.vec([0, 0, 0]))
    this.peers.set(outerHE, outerHE);
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
      this.setPos(tip, fromPos);
      tips.push(tip);

      const [innerHE1, outerHE1] = this.splitEdgeAcross(outerHE);
      const inward = innerHE1.from;
      inward.name = name;
      this.setPos(inward, innerPos);

      this.peers.set(outerHE0, outerHE1).set(outerHE1, outerHE0);
    }

    if (XYZ.normSquared(currentPos) > 1e-12) fail(
      `polygon not closed; offset: ${JSON.stringify(currentPos)}`
    );

    // remove dummy node
    this.contractEdge(outerHE);
    this.peers.delete(outerHE);


    tips.forEach(tip => {
      let [he0, he1] = tip.halfEdgesOut();
      if (he0.loop === innerHE.loop) [he0, he1] = [he1, he0];
      tip.name = `[${he0.to.name}^${he1.to.name}]`;
    });
  }

  checkWithData() {
    this.check();

    for (const loop of this.loops) {
      if (loop !== this.boundary && !this.isLoopFlat(loop)) {
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

  checkPeers(): void {
    const {boundary, peers} = this;

    if (!boundary) { // The manifold is completely folded to a polyhedron
      assert(peers.size === 0);
      return;
    }

    for (const he of boundary.halfEdges()) {
      assert(peers.has(he));
    }
    for (const [he0, he1] of peers) {
      if (he0.loop !== boundary) fail(
        `half-edge ${
          he0} (${he0.from} - ${he0.to}) with peer ${
          he0} (${he1.from} - ${he1.to}) found on non-boundary ${he0.loop}`
      );
      if (peers.get(he1) !== he0) fail(
        `peers not reciprocal: ${
          he0} (${he0.from} - ${he0.to}) and ${
          he0} (${he1.from} - ${he1.to})`
      );
      // Relaxed check so that it works after approximative "contract":
      if (Math.abs(this.heLength(he0) - this.heLength(he1)) > 1e-3) log(
        `WARNING: peer lengths do not fit: ${
          he0}: ${he0.from} ==${this.heLength(he0)}==> ${he0.to} vs. ${
          he1}: ${he1.from} ==${this.heLength(he1)}==> ${he1.to}`
      );

    }
  }

  logMesh() {
    const {vertices, loops, peers} = this;
    for (const l of loops) {
      log(l, "=", ...[...l.halfEdges()].flatMap(he => [he, he.to]));
      log(`  = (${count(l.halfEdges())}):`, ...[...l.halfEdges()].map(he => he.to.name));
    }
    for (const v of vertices) {
      const neighbors = [...v.neighbors()];
      log(
        v.toString().padEnd(15), v.firstHalfEdgeOut,
        this.pos(v).toString().padEnd(50) ?? "MISSING",
        neighbors.length, "neighbors:", neighbors.join(" ").padEnd(35),
        "faces:", [...v.loops()].join(" "),
      );
    }
    for (const [vi, vj] of choose([...vertices], 2)) {
      const dist = this.distance(vi, vj);
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
        const angle = XYZ.getAngle(this.faceOrientation(he), this.faceOrientation(he.twin));
        edgeMessages.push(
          `${he.from.name}->${he.to.name}: ${((.5-angle/TAU)*360).toFixed(5)}° ${
            he.from} ==[${he}(${he.loop})|${he.twin}(${he.twin.loop})]==> ${he.to}`
        );
      }
    }
    log(edgeMessages.sort().join("\n"));
    for (const [he0, he1] of peers) {
      if (he0.id > he1.id) continue;
      log(`peers: ${
        he0} (${he0.from.name}->${he0.to.name}), ${
        he1} (${he1.from.name}->${he1.to.name})`
      );
    }
  }

  bend(args: string[]) {
    const {vertices, pos} = this;

    if (args.length < 3) fail("bend expects 3 or more args");
    const angle = Number.parseFloat(args.shift());
    if (Number.isNaN(angle)) fail(
      "first arg of bend should be a number (an angle)."
    );
    const [first, ...rest] = args.map(name => {
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

    let prev = first;
    for (const current of rest) {
      const face = this.findUniqueFace(prev, current);
      const he_face_prev = findUnique(face.halfEdges(), he => he.to === prev);
      const he_face_current = findUnique(face.halfEdges(), he => he.to === current);
      const beyond = collectVertices(he_face_current.from, new Set([prev, current]));
      log("step:", prev, current, `{${beyond.values().toArray().join(" ")}}`)
      const [heSplit] = this.splitLoop(he_face_current, he_face_prev, {create: "left"});
      heSplit.loop.name = `split(${prev.name}-${current.name})`;

      // TODO simplify geometry
      const pivot = pos(current);
      const from = this.faceOrientation(heSplit);
      const to = XYZ.sandwich(
        XYZ.exp(XYZ.scale(-angle/2, XYZ.normalize(XYZ.dual(XYZ.minus(pos(prev), pivot)))))
      )(from);
      this.rotatePoints(
        pivot,
        XYZ.plus(pivot, from),
        XYZ.plus(pivot, to),
        beyond,
      );

      prev = current;
    }
  }

  bend2(args: string[]) {
    const {vertices, peers, pos} = this;

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

    if (peers.get(he_boundary_q) !== he_q_boundary) fail(
      `cannot attach non-peers ${
      he_boundary_q} (${he_boundary_q.from} - ${he_boundary_q.to}) and ${
        he_boundary_q} (${he_q_boundary.from} - ${he_q_boundary.to})`
    );

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
    this.splitLoop(
      findUnique(face1.halfEdges(), he => he.to === q),
      findUnique(face1.halfEdges(), he => he.to === s1),
      {create: "left"}
    )[0].loop.name = `split(${q.name}-${s1.name})`;

    const face2 = this.findUniqueFace(q, s2);;
    this.splitLoop(
      findUnique(face2.halfEdges(), he => he.to === s2),
      findUnique(face2.halfEdges(), he => he.to === q),
      {create: "left"}
    )[0].loop.name = `split(${q.name}-${s2.name})`;

    const border = new Set([s1, q, s2]);
    const beyond1 = collectVertices(t1, border);
    const beyond2 = collectVertices(t2, border);
    assert(beyond1.isDisjointFrom(beyond2));

    const [inters1 , inters2] = intersect3Spheres(
      pos(s1), pos(t1),
      pos(q ), pos(t1/* or t2 */),
      pos(s2), pos(t2),
    );
    const inters = choice === "+" ? inters2 : inters1;

    // TODO simplify geometry?
    this.rotatePoints(projectPointToLine(pos(t1), pos(s1), pos(q)), pos(t1), inters, beyond1);
    this.rotatePoints(projectPointToLine(pos(t2), pos(s2), pos(q)), pos(t2), inters, beyond2);
    assert(this.distance(t1, t2) < 1e-8);

    // TODO Let MeshG provide a method combining splitLoop and contractEdge?
    // This would avoid creating a temporary edge and a temporary loop.
    const tmpEdge = this.splitLoop(he_q_boundary, he_boundary_q.prev, {create: "left"});
    this.contractEdge(tmpEdge[0]);
    this.dropEdge(he_q_boundary);
    assert(peers.delete(he_boundary_q));
    assert(peers.delete(he_q_boundary));
    t1.name = mergeNames(t2.name, t1.name);

    const he_tip1_q_aux = findHE(t1, q);
    if (this.isBetweenCoplanarLoops(he_tip1_q_aux)) {
      // TODO create a test case for this situation
      this.dropEdge(he_tip1_q_aux); 
    }
  }

  reattach(args: string[]) {
    const {vertices, peers, pos, setPos} = this;

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
    if (
      peers.get(he_boundary_q) !== he_q_boundary ||
      peers.get(he_q_boundary) !== he_boundary_q
    ) fail(`cannot reattach at non-peers ${
      he_boundary_q} (${he_boundary_q.from} - ${he_boundary_q.to}) and ${
      he_q_boundary} (${he_q_boundary.from} - ${he_q_boundary.to})`);
    const t1 = he_boundary_q.from;
    const t2 = he_q_boundary.to;

    const [he_pq_A, he_qp_A] = this.splitLoop(he_face_p, he_face_q, {create: "right"});
    const [he_qp_B, he_pq_B] = this.splitLoop(he_pq_A, he_face_p, {create: "left"});
    log("AB", he_qp_A.loop.name, he_qp_B.loop.name);
    const [he_p0_p1, he_p1_p0] = this.splitVertex(he_qp_B, he_boundary_p, {create: "both"});
    setPos(he_p0_p1.from, pos(p));
    setPos(he_p0_p1.to, pos(p));
    vertices.delete(p);
    this.dropEdge(he_p0_p1);
    peers.set(he_pq_A, he_qp_B).set(he_qp_B, he_pq_A);

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
    log("before rot1", q, pos(q), fromV, pos(fromV), toV, pos(toV),
      "dist:", this.distance(fromV, toV),
      `{${part.values().map(v => pos(v)).toArray().join(" ")}}`);
    this.rotatePoints(pos(q), pos(fromV), pos(toV), part);
    log("after rot1", q, pos(q), fromV, pos(fromV), toV, pos(toV),
      "dist:", this.distance(fromV, toV),
      `{${part.values().map(v => pos(v)).toArray().join(" ")}}`);
    // But still the two faces behind q-t1 and q-t2 might not be in a plane.
    // So we perform another rotation of the snippet around the newly
    // coinciding edges:
    this.rotatePoints(
      pos(q),
      // TODO Avoid adding pos(q), which is subtracted immediately inside rotatePoints(...)
      XYZ.plus(pos(q), this.faceOrientation(fromHE.twin)),
      XYZ.plus(pos(q), XYZ.negate(this.faceOrientation(toHE.twin))),
      part,
    );
    log("after rot2", q, pos(q), fromV, pos(fromV), toV, pos(toV),
      "dist:", this.distance(fromV, toV),
      `{${part.values().map(v => pos(v)).toArray().join(" ")}}`);

    const [he_t1_t2, he_t2_t1] =
      this.splitLoop(he_q_boundary, he_q_boundary.prev.prev, {create: "left"});
    const t = this.contractEdge(he_t1_t2);
    t.name = mergeNames(he_t1_t2.from.name, he_t1_t2.to.name);
    this.dropEdge(he_q_boundary);
    if (!this.isBetweenCoplanarLoops(he_boundary_q)) fail(
      `faces not coplanar: ${he_boundary_q.loop} and ${he_boundary_q.twin}`
    );
    this.dropEdge(he_boundary_q);
    assert(this.peers.delete(he_boundary_q));
    assert(this.peers.delete(he_q_boundary));
    // TODO If more pairs of edges/vertices happen to align, merge them.
  }

  /**
   * Move the vertices in an iterative process towards a configuration such that
   * - all existing edges keep their lengths,
   * - the star tips coincide,
   * - and corresponding boundary vertices (duplicated by reattach operations)
   *   coincide.
   * 
   * The iteration steps do not keep faces flat.  Therefore the mesh must be
   * fully triangulated before this method is called.
   * 
   * After the vertices have been moved, corresponding vertices and
   * boundary edges are also merged topologically.
   * 
   * The only argument should be the number of iterations.
   */
  contract(args: string[]) {
    if (args.length !== 1) fail(`"contract" expects 1 argument`);
    const nSteps = Number.parseInt(args[0]);
    if (Number.isNaN(nSteps) || nSteps < 1) fail(
      `The argument of "contract" should be the number of optimization steps.`
    );

    const {vertices, loops, boundary, pos, setPos} = this;

    for (const l of loops) {
      if (l !== boundary && l.halfEdges().toArray().length !== 3) fail(
        `cannot run "contract" with non-triangle face: ${l} has ${
          l.halfEdges().toArray().length
        } edges.`
      );
    }

    const connections = new Map<Vertex, Map<Vertex, number>>();
    for (const va of vertices) {
      const vaConnections =
        new Map(va.neighbors().map(vb => [vb, this.distance(va, vb)]));

      // It's a bit hacky to detect peer nodes by name
      // (but it's easier than tracing reattachments).
      const vaBase = va.name.replace(/\..*$/, "");
      for (const vb of boundary.vertices()) {
        if (vb === va) continue;
        if (vb.name.replace(/\..*$/, "") === vaBase) {
          assert(!vaConnections.has(vb));
          vaConnections.set(vb, 0);
        } else if (va.name.includes("^") && vb.name.includes("^")) {
          assert(!vaConnections.has(vb));
          vaConnections.set(vb, 0);
        }
      }
      connections.set(va, vaConnections);
    }

    for (let i = 0; i < nSteps; i++) {
      const targets = connections.entries().map(([va, vaConnections]) => [
        va,
        XYZ.scale(
          1 / vaConnections.size,
          vaConnections.entries().reduce(
            (sum, [vb, len]) => XYZ.plus(sum, this.target(va, vb, len)),
            XYZ.zero(),
          ),
        ),
      ] as [Vertex, MV]).toArray();
      const badness =
        targets.reduce((sum, [v, target]) => sum + distance(pos(v), target), 0);
      log(`badness[${i}] = ${badness}`);
      for (const [v, pos] of targets) {
        setPos(v, pos);
      }
      // TODO be less strict?
      if (badness === 0) break;
    }

    // Note: I tried gluing before contracting in the hope that it improves
    // convergence, but it didn't.

    this.gluePeers();
  }

  /** Where `vb` would like to place `va` so that the distance is `len` */
  target(va: Vertex, vb: Vertex, len: number): MV {
    const {pos} = this;
    if (len === 0) return pos(vb); // just an optimization
    const vec_ba = XYZ.minus(pos(va), pos(vb));
    return XYZ.plus(pos(vb), XYZ.scale(len / (XYZ.norm(vec_ba) || 1), vec_ba));
  }

  gluePeers() {
    const {boundary, peers} = this;
    while (peers.size > 2) {
      log(`peers left: ${peers.size}`);
      const [he0, he1] = peers.entries().find(([he0, he1]) => he0.to === he1.from);
      log(`gluing ${he0}, ${he1} at ${he0.to}`);
      const [he2, he3] = this.splitLoop(he0.prev, he1, {create: "right"});
      this.contractEdge(he2);
      he2.from.name = mergeNames(he2.to.name, he2.from.name);
      this.dropEdge(he0);
      assert(peers.delete(he0));
      assert(peers.delete(he1));
    }
    {
      log("gluing last peers", ...boundary.halfEdges());
      let he0 = boundary.firstHalfEdge;
      let he1 = he0.next;
      assert(peers.get(he0) === he1);
      assert(peers.get(he1) === he0);
      this.dropEdge(he0);
      assert(peers.delete(he0));
      assert(peers.delete(he1));
      this.boundary = undefined;
    }
  }

  rotatePoints(pivot: MV, from: MV, to: MV, vertices: Set<Vertex>) {
    const {pos, setPos} = this;
    rotatePoints(pivot, from, to,
      vertices.values().map(v => ({
        // Backward-compatibility hack:
        // Give rotatePoints(...) to read and write a member pos.
        get pos() { return pos(v); },
        set pos(value) { setPos(v, value)},
      })).toArray(),
    );
  }

  /**
   * Would merging the two loops adjacent to `he` and its twin result
   * in a flat loop?
   */
  isBetweenCoplanarLoops(he: HalfEdge): boolean {
    assert(this.isLoopFlat(he.loop));
    assert(this.isLoopFlat(he.twin.loop));
    // Assuming that each of the two loops is already flat, we only need to
    // check if they have the same normalized directed areas.
    // If one of the loops is degenerated, the union is flat as well.
    const a1 = this.directedArea(he.loop), a2 = this.directedArea(he.twin.loop);
    const a1n = XYZ.norm(a1), a2n = XYZ.norm(a2);
    return (
      a1n < 1e-8 || a2n < 1e-8 ||
      closeTo0(XYZ.minus(XYZ.scale(1/a1n, a1), XYZ.scale(1/a2n, a2)))
    );
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

  distance = (from: Vertex, to: Vertex) => distance(this.pos(from), this.pos(to));

  heLength = (he: HalfEdge) => this.distance(he.from, he.to);

  heCenter = (he: HalfEdge) =>
    XYZ.scale(.5, XYZ.plus(this.pos(he.from), this.pos(he.to)));

  isLoopFlat(loop: Loop) {
    // This is a bit too optimistic:  A non-flat loop with total area 0 will be
    // reported as flat.
    const a = this.directedArea(loop);
    for (const {from, to} of loop.halfEdges()) {
      if (!closeTo0(XYZ.wedgeProduct(a, XYZ.minus(this.pos(to), this.pos(from))))) {
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
  faceOrientation = (he: HalfEdge) =>
    XYZ.contractLeft(XYZ.minus(this.pos(he.to), this.pos(he.from)), this.directedArea(he.loop));
  
  directedArea = (loop: Loop) => loop.halfEdges().reduce(
    (acc, {from, to}) => XYZ.plus(acc, XYZ.wedgeProduct(this.pos(from), this.pos(to))),
    XYZ.zero(),
  );
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

const mergeNames = (a: string, b: string) =>
  (a.endsWith(".0") || a.endsWith(".1")) &&
  (b.endsWith(".0") || b.endsWith(".1")) &&
  a.slice(0, -2) === b.slice(0, -2) &&
  a !== b
  ? a.slice(0, -2)
  : `[${a}|${b}]`;
