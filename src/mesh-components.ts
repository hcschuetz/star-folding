import { MV } from "./geom-utils";
import { fail, log } from "./utils";

abstract class WithId {
  static count = 0;
  id: string;
  constructor() {
    this.id = "#" + WithId.count++;
  }
}

export class HalfEdge extends WithId {
  loop: Loop;
  /**
   * A symmetric relation for boundary half edges.
   * Two half edges are peers if they are expected to be glued together in the
   * final polyhedron.
   * The peer relation is (at least for now) only used for redundancy.
   */
  peer: HalfEdge | null = null;

  prev: HalfEdge;
  twin: HalfEdge;
  next: HalfEdge;

  to: Vertex;
  get from() { return this.twin.to; }

  toString() { return "he" + this.id; }
}

export function findHE(from: Vertex, to: Vertex) {
  const results: HalfEdge[] = [];
  for (const he of from.halfEdgesOut()) {
    if (he.to === to) {
      results.push(he);
    }
  }
  if (results.length !== 1) fail(`Found ${results.length} half-edges from ${from.name} to ${to.name}.`);
  return results[0];
}

export function makeEdge(f1: Loop, f2: Loop, to1: Vertex, to2: Vertex) {
  const he1 = new HalfEdge(), he2 = new HalfEdge();
  he1.twin = he2; he2.twin = he1;
  he1.loop = f1 ; he2.loop = f2;
  he1.to   = to1; he2.to   = to2;
  log(`new edge ${he1}|${he2} connecting ${to2} - ${to1} separating ${f1} | ${f2}`);
  return [he1, he2];
}

export function chainHEs(first: HalfEdge, ...rest: HalfEdge[]) {
  let prev = first;
  for (let next of rest) {
    prev.next = next;
    next.prev = prev;
    prev = next;  
  }
}

export class Vertex extends WithId {
  firstHalfEdgeOut: HalfEdge;
  name: string;
  pos: MV;

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

export abstract class Loop extends WithId {
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

export class Face extends Loop {
  toString() { return `f${this.id}/${this.name}`; }
}

export class Boundary extends Loop {
  toString() { return `b${this.id}/${this.name}`; }
}
