import { XYZ } from "./geom-utils";
import { Algebra, Multivector } from "./geometric-algebra/Algebra";
import { makeLetterNames } from "./geometric-algebra/componentNaming";
import NumericBackEnd from "./geometric-algebra/NumericBackEnd";
import { assert } from "./utils";

type MV = Multivector<never>;

const UV = new Algebra<never>([1, 1], new NumericBackEnd(), makeLetterNames("uv"));

/**
 * +1 or -1 (or even 0) depending on the orientation of triangle pqr in the
 * UV space.
 * 
 * We do not care which orientation is +1 or -1.  We just need consistency.
 */
const orientation = (p: MV, q: MV, r: MV) =>
  Math.sign(UV.wedgeProduct(UV.minus(q, p), UV.minus(r, p)).value("uv"));

/** Is s inside triangle (p,q,r)? */
const contains = (p: MV, q: MV, r: MV, s: MV): boolean => {
  const pqr = orientation(p, q, r);
  return (
    orientation(s, q, r) === pqr &&
    orientation(p, s, r) === pqr &&
    orientation(p, q, s) === pqr
  );
}


type VTX = {
  v3: MV, // in XYZ
  v2: MV, // in UV
  u: number, // u coordinate of v2
  i: number, // a temporary index;
};

/**
 * Triangulate a simple but possibly concave polygon given in XYZ space.
 * 
 * The implementation is intended to be readable and is not optimized.
 */
export default function triangulate(polygon3: MV[]) {
  // 1. Map our polygon from 3D to 2D, where the actual triangulation
  //    algorithm works.
  // 1.1 Determine the bounding box
  let xMin: number, yMin: number, zMin: number,
      xMax: number, yMax: number, zMax: number;
  for (const mv3 of polygon3) {
    const x = mv3.value("x"), y = mv3.value("y"), z = mv3.value("z");
    xMin = Math.min(xMin, x); yMin = Math.min(yMin, y); zMin = Math.min(zMin, z);
    xMax = Math.max(xMax, x); yMax = Math.max(yMax, y); zMax = Math.max(zMax, z);
  }
  // 1.2 Find the two coordinate axes in which the bounding box is most extended.
  const spans = {x: xMax - xMin, y: yMax - yMin, z: zMax - zMin};
  const [[primary], [secondary]] =
    Object.entries(spans).sort(([c1, s1], [c2, s2]) => s2 - s1);

  // 1.3 Map the polygon to the coordinate plane spanned by these two axes.
  //     For convenience we also keep the 3D vertex and the primary-axis value u.
  const polygon: VTX[] = polygon3.map(v3 => {
    const u = v3.value(primary), v = v3.value(secondary);
    return {v3, v2: UV.vec([u, v]), u, i: -1 /* not yet used */};
  });

  /** 2. Triangles will be collected here. (The inner arrays will have 3 elements.) */
  const result: MV[][] = [];

  /** 3. Recursively subdivide the polygon. */
  function recur(subPoly: VTX[]) {
    switch (subPoly.length) {
      case 0:
      case 1:
      case 2:
        return; // or fail?
      case 3: {
        // We have reached a triangle. Emit and stop the recursion.
        result.push(subPoly.map(s => s.v3));
        return;
      }
      default: {
        // We still have 4 or more points

        // Set `.i` to be an index into `subPoly`.
        subPoly.forEach((s, i) => s.i = i);
        // Find the vertex index in `subPoly` with the highest u value.
        const iMax =
          subPoly.reduce((acc, elem) => acc.u > elem.u ? acc : elem).i;
        // Rotate the polygon and decomposeit into
        // - vertex `current` with the highest u value,
        // - its two neighbors `prev` and `next`,
        // - and the `rest`.
        const [prev, current, next, ...rest] =
          [...subPoly.slice(iMax - 1), ...subPoly.slice(0, iMax - 1)];
        // [prev, current, next] might be an "ear".

        // Find any `rest` points inside our ear candidate.
        const inCandidate: VTX[] =
          rest.filter(s => contains(prev.v2, current.v2, next.v2, s.v2));
        if (inCandidate.length === 0) {
          // [prev, current, next] is actually an ear.
          // Cut it off and continue with the remaining polygon.
          result.push([prev.v3, current.v3, next.v3]);
          recur([prev, next, ...rest]);
        } else {
          // [prev, current, next] is not an ear.
          // Set `.i` to be an index into `rest`.
          rest.forEach((s, i) => s.i = i);
          // Find the `inCandidate` element (actually its index in `rest`)
          // with the highest u value.
          let iMax2 =
            inCandidate.reduce((acc, elem) => acc.u > elem.u ? acc : elem).i;
          // Cut the polygon between `current` and `vMax2`.  (By construction
          // the cut is along a diagonal which cannot intersect any other edge.)
          // Handle the two sub-polygons recursively.
          recur([current, next, ...rest.slice(0, iMax2 + 1)]);
          recur([prev, current, ...rest.slice(iMax2)]);
        }
      }
    }
  }

  // 4. Start the recursion
  recur(polygon);

  // 5. Return the collected triangles
  return result;
}
