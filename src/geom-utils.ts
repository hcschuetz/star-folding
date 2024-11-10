import { Multivector } from "./geometric-algebra/Algebra";
import { B, baseToRepr, makeSphere, R, reprToBase, splitPointPair } from "./geometric-algebra/conformal";
import { assert, log } from "./utils";

export { B as E3 };
export type MV = Multivector<never>;

export const closeTo0 = (mv: MV) =>
  [...mv].every(([, val]) => Math.abs(val) < 1e-8);

export const TAU = 2 * Math.PI;

const halfGridAngle = TAU/12;
const rotorXY60  = B.mv({1: Math.cos(halfGridAngle), xy: -Math.sin(halfGridAngle)});
export const rotXY60 = B.sandwich(rotorXY60);

export const distance = (a: Multivector<never>, b: Multivector<never>) =>
  B.norm(B.minus(a, b));

/** Project the first point to the line given by the other two points. */
export function projectPointToLine(p: MV, q: MV, r: MV) {
  const qp = B.minus(p, q)
  const qr = B.minus(r, q);
  const factor =
    B.scalarProduct(qr, qp) /
    B.scalarProduct(qr, qr);
  return B.plus(q, B.scale(factor, qr));
}

function test_projectPointToLine() {
  const p = B.vec([8,1,2]);
  const q = B.vec([1,4,-2]);
  const r = B.vec([3,1,7]);
  const foot = projectPointToLine(p, q, r);
  // Vectors foot-p and r-q are perpendicular:
  assert(Math.abs(B.scalarProduct(
    B.minus(foot, p),
    B.minus(r, q),
  )) < 1e-8);
  // Vectors q-foot and r-foot are collinear:
  assert(closeTo0(B.wedgeProduct(
    B.minus(q, foot),
    B.minus(r, foot),
  )));
  console.log(`test for projectPointToLine(...) succeeded: ${foot}`);
}
// test_projectPointToLine();

/**
 * Find the 2 intersection points of 3 spheres.
 * Each sphere is given by its center and a point on its surface.
 */
export function intersect3Spheres(
  c1: MV, p1: MV,
  c2: MV, p2: MV,
  c3: MV, p3: MV,
) {
  const intersections = splitPointPair(R.regressiveProduct(
    makeSphere(baseToRepr(c1), baseToRepr(p1)),
    makeSphere(baseToRepr(c2), baseToRepr(p2)),
    makeSphere(baseToRepr(c3), baseToRepr(p3)),
  )).map(reprToBase);
  log(`intersections:\n  ${intersections.join("\n  ")}`);
  log("distances:");
  [c1, c2, c3].forEach((c, j) => {
    intersections.forEach((inters, i) =>
      log(`  center${j+1} - inters${i+1}: ${distance(c, inters).toFixed(5)}`)
    );
  });
  return intersections;
}

export function rotatePoints(
  axisPoint1: MV, axisPoint2: MV,
  from: MV, to: MV,
  points: Iterable<{pos: MV}>,
) {
  const pivot = projectPointToLine(from, axisPoint1, axisPoint2);
  const pivot2 = projectPointToLine(to, axisPoint1, axisPoint2);
  log(`pivot: ${pivot} (should equal ${pivot2})`);
  assert(distance(pivot, pivot2) < 1e-8);
  const dir1 = B.normalize(B.minus(to, pivot));
  const dir2 = B.normalize(B.minus(from, pivot));
  const dirMid = B.normalize(B.plus(dir1, dir2));
  const rot = B.geometricProduct(dir1, dirMid);
  const transform = (point: MV) =>
    B.plus(B.sandwich(rot)(B.minus(point, pivot)), pivot);
  const angle = B.getAngle(B.minus(from, pivot), B.minus(to, pivot));
  log(`rotation around: ${axisPoint1}} - ${axisPoint2}`,
    `\n  pivot: ${pivot}`,
    `\n  axis: ${B.minus(axisPoint2, axisPoint1)}`,
    `\n  angle: ${(angle * 180 / Math.PI).toFixed(5)}° = ${angle}`,
  );
  for (const pt of points) {
    const newPos = transform(pt.pos);
    log(`  - rotate ${pt} from ${pt.pos} to ${newPos}`);
    pt.pos = newPos;
  }
}
