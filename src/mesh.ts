abstract class WithId {
  static count = 0;
  id: string;
  constructor() {
    this.id = "#" + WithId.count++;
  }
}

abstract class Named extends WithId {
  constructor(
    public mesh: Mesh,
    public name: string,
  ) { super(); }
}

// Added suffix "G" to exported generic classes so that application code can
// use the plain names for the specific instances (without `import ... as`).

export class HalfEdge extends WithId {
  loop: Loop;

  prev: HalfEdge;
  twin: HalfEdge;
  next: HalfEdge;

  to: Vertex;
  alive = true;

  get from() { return this.twin.to; }

  toString() { return "he" + this.id + (this.alive ? "" : "[dead]"); }
}

export type Edge = [HalfEdge, HalfEdge];

const SIZE_LIMIT = 50;

export class Vertex extends Named {
  firstHalfEdgeOut: HalfEdge;

  *halfEdgesOut() {
    let he = this.firstHalfEdgeOut;
    let count = 1;
    do {
      yield he;
      if (++count > SIZE_LIMIT) {
        const {log, fail} = this.mesh;
        log(`too many outgoing half edges around ${this}`);
        for (let i = 1, he = this.firstHalfEdgeOut; i < SIZE_LIMIT; i++, he = he.twin.next) {
          log(`  ${he}  ${he.loop}  ${he.to}`);
        }
        fail(`too many outgoing half edges around ${this}`);
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

export class Loop extends Named {
  firstHalfEdge: HalfEdge;

  *halfEdges() {
    let he = this.firstHalfEdge;
    let count = 1;
    do {
      yield he;
      if (++count > SIZE_LIMIT) {
        const {log, fail} = this.mesh;
        log(`too many half edges around ${this}`);
        for (let i = 1, he = this.firstHalfEdge; i < SIZE_LIMIT; i++, he = he.next) {
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
  toString() { return `l${this.id}/${this.name}`; }
}

export class Mesh {
  vertices = new Set<Vertex>();
  loops = new Set<Loop>();

  constructor(
    public log: (...args: any[]) => unknown,
    public fail: (msg: string) => never,
  ) {}

  makeVertex(name: string) {
    const v = new Vertex(this, name);
    this.vertices.add(v);
    return v;
  }

  makeLoop(name: string) {
    const l = new Loop(this, name);
    this.loops.add(l);
    return l;
  }

  /**
   * Create a new twin pair of half edges adjacent to the given loops and vertices.
   * 
   * The returned pair consists of
   * - a half edge adjacent to `l0`, pointing from `v0` to `v1` and
   * - a half edge adjacent to `l1`, pointing from `v1` to `v0`.
   */
  makeEdge(
    l0: Loop, l1: Loop,
    v0: Vertex, v1: Vertex
  ): Edge {
    const he0 = new HalfEdge(), he1 = new HalfEdge();
    he0.twin = he1; he1.twin = he0;
    he0.loop = l0 ; he1.loop = l1 ;
    he0.to   = v1 ; he1.to   = v0 ;

    v0.firstHalfEdgeOut = l0.firstHalfEdge = he0;
    v1.firstHalfEdgeOut = l1.firstHalfEdge = he1;

    this.log(`new edge ${he0}|${he1}:   ${v0} - ${v1}   ${l0} | ${l1}`);
    return [he0, he1];
  }

  /** Create a 2-sided 1-gon out of thin air. */
  addCore() {
    const v = this.makeVertex("core");
    const l0 = this.makeLoop("core1");
    const l1 = this.makeLoop("core2");
    const edge = this.makeEdge(l0, l1, v, v);
    const [he0, he1] = edge;
    chainHEs(he0, he0);
    chainHEs(he1, he1);
    v.firstHalfEdgeOut = he0;
    l0.firstHalfEdge = he0;
    l1.firstHalfEdge = he1;
    return edge;
  }

  /** Eliminate a 2-sided 1-gon as created by `.addCore()` */
  dropCore(v: Vertex) {
    const he = v.firstHalfEdgeOut;
    const {twin} = he;
    if (!(
      he.to === v &&
      he.prev === he &&
      he.next === he &&
      twin.to === v &&
      twin.prev === twin &&
      twin.next === twin
    )) this.fail(`trying to drop non-core at ${v}`);
    this.vertices.delete(v);
    this.loops.delete(he.loop);
    this.loops.delete(twin.loop);
    he.alive = false;
    twin.alive = false;
  }

  /**
   * Split a vertex into two vertices.
   * 
   * Expects two different half edges pointing to the vertex to be split.
   * Depending on the `create` option, one or both "child vertices" will be
   * newly created.  The returned edge will be adjacent to the child vertices
   * and the loops adjacent to the input half edges.
   */
  splitVertex(
    he0: HalfEdge,
    he1: HalfEdge,
    options?: {create: "left" | "right" | "both"},
  ): Edge {
    if (!he0.alive) this.fail(`splitVertex with dead half edge ${he0}`);
    if (!he1.alive) this.fail(`splitVertex with dead half edge ${he1}`);
    const v = he0.to;
    if (he1.to !== v) this.fail(
      `splitVertex: parameters point to different vertices: ${v} !== ${he1.to}`
    );

    const create = options?.create ?? "both";
    const v0 = create === "right" ? v : this.makeVertex(v.name + ".0");
    const v1 = create === "left"  ? v : this.makeVertex(v.name + ".1");

    // Re-connect v's incoming half-edges to v0 and v1.
    // (If he0 === he1, all neighbors are connected to v0.)
    let he = he0;
    do { he.to = v0; he = he.twin.prev; } while (he !== he1);
    while (he !== he0) { he.to = v1; he = he.twin.prev; }

    const newEdge = this.makeEdge(he0.loop, he1.loop, v0, v1);
    chainHEs(he0, newEdge[0], he0.next);
    chainHEs(he1, newEdge[1], he1.next);
    return newEdge;
  }

  /**
   * Split a loop into two loops.
   * 
   * The two given half edges must have the same `.loop` value.
   * Depending on the `create` option, one or both "child" loops will be
   * newly created.  The returned edge will be adjacent to the child loops
   * and the `.to` ends of the input half edges.
   */
  splitLoop(
    he0: HalfEdge,
    he1: HalfEdge,
    options?: {create: "left" | "right" | "both"},
  ): Edge {
    if (!he0.alive) this.fail(`splitLoop with dead half edge ${he0}`);
    if (!he1.alive) this.fail(`splitLoop with dead half edge ${he1}`);
    const l = he0.loop;
    if (he1.loop !== l) this.fail(
      `splitLoop: parameters point to different loops: ${l} !== ${he1.loop}`
    );

    const create = options?.create ?? "both";
    const l0 = create === "right" ? l : this.makeLoop(l.name + ".0");
    const l1 = create === "left"  ? l : this.makeLoop(l.name + ".1");

    // Re-connect l's half-edges to l0 and l1.
    // (If he0 === he1, all half-edges are connected to l0.)
    let he = he0;
    do { he.loop = l0; he = he.prev; } while (he !== he1);
    while (he !== he0) { he.loop = l1; he = he.prev; }

    const newEdge = this.makeEdge(l0, l1, he0.to, he1.to);
    const he0_next = he0.next; // save original value
    chainHEs(he0, newEdge[0], he1.next);
    if (he0 === he1) { // edge case:
      chainHEs(newEdge[1], newEdge[1]);
    } else { // normal case:
      chainHEs(he1, newEdge[1], he0_next);
    }
    return newEdge;
  }

  splitEdgeAcross(he: HalfEdge) {
    return this.splitVertex(he.twin.prev, he, {create: "left"});
  }

  splitEdgeAlong(he: HalfEdge) {
    // TODO check create option
    return this.splitLoop(he, he.prev, {create: "left"});
  }

  /**
   * Eliminate edge `(he, he.twin)` and merge vertex `he.to` into `he.from`.
   * Return the latter.
   */
  contractEdge(he: HalfEdge) {
    if (!he.alive) this.fail(`contractEdge with dead half edge ${he}`);
    if (!he.twin.alive) this.fail(`contractEdge with dead half-edge twin ${he.twin}`);
    const {to, loop, prev, next, twin} = he;
    const {to: from, loop: twin_loop, prev: twin_prev, next: twin_next} = twin;
    if (to === from) this.fail(
      `cannot contract an edge starting and ending at the same vertex`
    );

    for (const heAux of to.halfEdgesIn().toArray()) {
      heAux.to = from;
    }

    if (twin === next) {
      if (twin === prev) this.fail(
        // Can this actually happen?
        `Trying to contract an edge between two vertices that have no other edges.`
      );
      if (loop !== twin_loop) this.fail(
        `The half edges of single-edge vertex ${to} should be adjacent to the same loop\n` +
        `but are adjacent to ${loop} and ${twin_loop}.`
      )
      chainHEs(prev, twin_next);
      loop.firstHalfEdge = twin_next;
      from.firstHalfEdgeOut = twin_next;
    } else if (twin === prev) {
      if (loop !== twin_loop) this.fail(
        `The half edges of single-edge vertex ${from} should be adjacent to the same loop\n` +
        `but are adjacent to ${loop} and ${twin_loop}.`
      );
      chainHEs(twin_prev, next);
      loop.firstHalfEdge = next;
      from.firstHalfEdgeOut = next;
    } else {
      chainHEs(prev, next);
      chainHEs(twin_prev, twin_next);
      loop.firstHalfEdge = next;
      twin_loop.firstHalfEdge = twin_next;
      from.firstHalfEdgeOut = next;
    }

    this.vertices.delete(to);
    he.alive = false;
    he.twin.alive = false;

    return from;
  }

  /**
   * Eliminate edge `(he, he.twin)` and merge `he.loop` into `he.twin.loop`.
   * Return the latter.
   */
  dropEdge(he: HalfEdge) {
    if (!he.alive) this.fail(`dropEdge with dead half edge ${he}`);
    if (!he.twin.alive) this.fail(`dropEdge with dead half-edge twin ${he.twin}`);
    const {
      to, loop, prev, next,
      twin: {to: from, loop: twin_loop, prev: twin_prev, next: twin_next},
    } = he;
    if (loop === twin_loop) this.fail(
      `cannot drop edge adjacent to the same loop twice`
    );
    this.log("dropEdge:", loop, he, next)

    let count = 0;
    for (let heAux = next; heAux !== he; heAux = heAux.next) {
      this.log("dropEdge, reassign:", loop, heAux)
      if (++count > SIZE_LIMIT) this.fail(`dropEdge: loop ${loop} too long`);
      heAux.loop = twin_loop;
    }

    chainHEs(twin_prev, next);
    chainHEs(prev, twin_next);

    from.firstHalfEdgeOut = twin_next;
    to.firstHalfEdgeOut = next
    twin_loop.firstHalfEdge = twin_next;

    this.loops.delete(loop); 
    he.alive = false;
    he.twin.alive = false;

    return twin_loop;
  }

  check() {
    const {vertices, loops, fail} = this;

    function checkHE(he: HalfEdge) {
      if (!he.alive) fail(
        `${he} is not alive`
      );
      if (!vertices.has(he.to)) fail(
        `${he} points to missing vertex ${he.to}`
      );
      if (!loops.has(he.loop)) fail(
        `${he} references missing loop ${he.loop}`
      );
      if (he.twin.twin !== he) fail(
        `inconsistent twins: ${he} => ${he.twin} => ${he.twin.twin}`
      );
      if (he.prev.next !== he) fail(
        `inconsistent prev/next: ${he} => ${he.prev} => ${he.prev.next}`
      );
      if (he.next.prev !== he) fail(
        `inconsistent next/prev: ${he} => ${he.next} => ${he.next.prev}`
      );
    }

    const seenVertexNames = new Set<string>();

    for (let v of vertices) {
      if (v.mesh !== this) fail(`foreign vertex: ${v}`);

      if (seenVertexNames.has(v.name)) fail(`duplicate vertex name: ${v.name}`);
      seenVertexNames.add(v.name);

      for (const he of v.halfEdgesOut()) {
        if (he.from !== v) fail(
          `inconsistent vertex: ${v} has outgoing ${he} starting from ${he.from}`
        );
        checkHE(he);
      }
    }

    const seenLoopNames = new Set<string>();

    for (let l of loops) {
      if (l.mesh !== this) fail(`foreign loop: ${l}`);

      if (seenLoopNames.has(l.name)) fail(`duplicate loop name: ${l.name}`);
      seenLoopNames.add(l.name);

      for (const he of l.halfEdges()) {
        if (he.loop !== l) fail(
          `inconsistent loop: ${l} has ${he} referencing ${he.loop}`
        );
        checkHE(he);
      }
    }
  }
}

export function findHE(from: Vertex, to: Vertex) {
  const results: HalfEdge[] = [];
  for (const he of from.halfEdgesOut()) {
    if (he.to === to) {
      results.push(he);
    }
  }
  if (results.length !== 1) from.mesh.fail(
    `Found ${results.length} half-edges from ${from} to ${to}.`
  );
  return results[0];
}

export function chainHEs(first: HalfEdge, ...rest: HalfEdge[]) {
  let prev = first;
  for (const he of rest) {
    he.prev = prev;
    prev.next = he;
    prev = he;
  }
}
