abstract class WithId<V,L,E> {
  static count = 0;
  id: string;
  constructor() {
    this.id = "#" + WithId.count++;
  }
}

abstract class Named<V,L,E> extends WithId <V,L,E>{
  constructor(
    public mesh: MeshG<V,L,E>,
    public name: string,
  ) { super(); }
}

// Added suffix "G" to exported generic classes so that application code can
// use the plain names for the specific instances (without `import ... as`).

export class HalfEdgeG<V,L,E> extends WithId<V,L,E> {
  loop: LoopG<V,L,E>;

  prev: HalfEdgeG<V,L,E>;
  twin: HalfEdgeG<V,L,E>;
  next: HalfEdgeG<V,L,E>;

  to: VertexG<V,L,E>;
  d?: E;

  get from() { return this.twin.to; }

  toString() { return "he" + this.id; }
}

export type Edge<V,L,E> = [HalfEdgeG<V,L,E>, HalfEdgeG<V,L,E>];

const SIZE_LIMIT = 50;

export class VertexG<V,L,E> extends Named<V,L,E> {
  firstHalfEdgeOut: HalfEdgeG<V,L,E>;
  d?: V;

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

export class LoopG<V,L,E> extends Named<V,L,E> {
  firstHalfEdge: HalfEdgeG<V,L,E>;
  d?: L;

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

export class MeshG<V,L,E> {
  vertices = new Set<VertexG<V,L,E>>();
  loops = new Set<LoopG<V,L,E>>();

  constructor(
    public log: (...args: any[]) => unknown,
    public fail: (msg: string) => never,
  ) {}

  makeVertex(name: string) {
    const v = new VertexG<V,L,E>(this, name);
    this.vertices.add(v);
    return v;
  }

  makeLoop(name: string) {
    const l = new LoopG<V,L,E>(this, name);
    this.loops.add(l);
    return l;
  }

  makeEdge(
    l0: LoopG<V,L,E>, l1: LoopG<V,L,E>,
    v0: VertexG<V,L,E>, v1: VertexG<V,L,E>
  ): Edge<V,L,E> {
    const he0 = new HalfEdgeG<V,L,E>(), he1 = new HalfEdgeG<V,L,E>();
    he0.twin = he1; he1.twin = he0;
    he0.loop = l0 ; he1.loop = l1 ;
    he0.to   = v1 ; he1.to   = v0 ;

    v0.firstHalfEdgeOut = l0.firstHalfEdge = he0;
    v1.firstHalfEdgeOut = l1.firstHalfEdge = he1;

    this.log(`new edge ${he0}|${he1}:   ${v0} - ${v1}   ${l0} | ${l1}`);
    return [he0, he1];
  }

  /** Create a 2-sided 1-gon. */
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

  /**
   * Split a vertex into two vertices.
   * 
   * Expects two different half edges pointing to the vertex to be split.
   * Depending on the `create` option, one or both "child vertices" will be
   * newly created.  The returned edge will be adjacent to the child vertices
   * and the loops adjacent to the input half edges.
   */
  splitVertex(
    he0: HalfEdgeG<V,L,E>,
    he1: HalfEdgeG<V,L,E>,
    options?: {create: "left" | "right" | "both"},
  ): Edge<V,L,E> {
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
    he0: HalfEdgeG<V,L,E>,
    he1: HalfEdgeG<V,L,E>,
    options?: {create: "left" | "right" | "both"},
  ): Edge<V,L,E> {
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

  splitEdgeAcross(he: HalfEdgeG<V,L,E>) {
    return this.splitVertex(he.twin.prev, he, {create: "left"});
  }

  splitEdgeAlong(he: HalfEdgeG<V,L,E>) {
    // TODO check create option
    return this.splitLoop(he, he.prev, {create: "left"});
  }

  /**
   * Eliminate edge `(he, he.twin)` and merge vertex `he.to` into `he.from`.
   */
  contractEdge(he: HalfEdgeG<V,L,E>) {
    const {
      to, loop, prev, next,
      twin: {to: from, loop: twin_loop, prev: twin_prev, next: twin_next},
    } = he;
    if (to === from) this.fail(
      `cannot contract an edge starting and ending at the same vertex`
    );

    for (let heAux = twin_prev; heAux !== he; heAux = heAux.twin.prev) {
      heAux.to = from;
    }

    chainHEs(prev, next);
    chainHEs(twin_prev, twin_next);

    loop.firstHalfEdge = next;
    twin_loop.firstHalfEdge = twin_next;
    from.firstHalfEdgeOut = next;

    this.vertices.delete(to); // TODO somehow mark he and he.twin as dead?
  }

  /**
   * Eliminate edge `(he, he.twin)` and merge `he.loop` into `he.twin.loop`.
   */
  dropEdge(he: HalfEdgeG<V,L,E>) {
    const {
      to, loop, prev, next,
      twin: {to: from, loop: twin_loop, prev: twin_prev, next: twin_next},
    } = he;
    if (loop === twin_loop) this.fail(
      `cannot drop edge adjacent to the same loop twice`
    );

    for (let heAux = next; heAux !== he; heAux = heAux.next) {
      heAux.loop = twin_loop;
    }

    chainHEs(twin_prev, next);
    chainHEs(prev, twin_next);

    from.firstHalfEdgeOut = twin_next;
    to.firstHalfEdgeOut = next
    twin_loop.firstHalfEdge = twin_next;

    this.loops.delete(loop); // TODO somehow mark he and he.twin as dead?
  }

  check() {
    const {vertices, loops, fail} = this;

    function checkHE(he: HalfEdgeG<V,L,E>) {
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

    for (let v of vertices) {
      if (v.mesh !== this) fail(`foreign vertex: ${v}`);
      for (const he of v.halfEdgesOut()) {
        if (he.from !== v) fail(
          `inconsistent vertex: ${v} has outgoing ${he} starting from ${he.from}`
        );
        checkHE(he);
      }
    }

    for (let l of loops) {
      if (l.mesh !== this) fail(`f
        oreign loop: ${l}`);
      for (const he of l.halfEdges()) {
        if (he.loop !== l) fail(
          `inconsistent loop: ${l} has ${he} referencing ${he.loop}`
        );
        checkHE(he);
      }
    }
  }
}

export function findHE<V,L,E>(from: VertexG<V,L,E>, to: VertexG<V,L,E>) {
  const results: HalfEdgeG<V,L,E>[] = [];
  for (const he of from.halfEdgesOut()) {
    if (he.to === to) {
      results.push(he);
    }
  }
  if (results.length !== 1) from.mesh.fail(
    `Found ${results.length} half-edges from ${from.name} to ${to.name}.`
  );
  return results[0];
}

export function chainHEs<V,L,E>(first: HalfEdgeG<V,L,E>, ...rest: HalfEdgeG<V,L,E>[]) {
  let prev = first;
  for (const he of rest) {
    he.prev = prev;
    prev.next = he;
    prev = he;
  }
}
