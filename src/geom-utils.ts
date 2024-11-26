import { Multivector } from "./geometric-algebra/Algebra";
import { B, baseToRepr, makeSphere, R, reprToBase, splitPointPair } from "./geometric-algebra/conformal";
import { assert, log } from "./utils";

export { B as XYZ };
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

/**
 * Rotate `points` around `pivot` in the plane of `pivot`, `from`, and `to`
 * by the angle (from, pivot, to).
 */
export function rotatePoints(
  pivot: MV,
  from: MV, to: MV,
  points: Iterable<{pos: MV}>,
) {
  const dir1 = B.normalize(B.minus(to, pivot));
  const dir2 = B.normalize(B.minus(from, pivot));
  const dirMid = B.normalize(B.plus(dir1, dir2));
  const rot = B.geometricProduct(dir1, dirMid);
  const transform = (point: MV) =>
    B.plus(B.sandwich(rot)(B.minus(point, pivot)), pivot);
  const angle = B.getAngle(B.minus(from, pivot), B.minus(to, pivot));
  log(`rotation around: ${pivot} from ${from} to ${to};\n  angle: ${(angle * 180 / Math.PI).toFixed(5)}° = ${angle}`);
  for (const pt of points) {
    const newPos = transform(pt.pos);
    log(`  - rotate ${pt.pos} to ${newPos}`);
    pt.pos = newPos;
  }
}


export const interpolate = (a: MV, b: MV, lambda: number) =>
  B.plus(B.scale(1-lambda, a), B.scale(lambda, b));

// For 1-vectors.
export const dot = (a: MV, b: MV) => B.contractLeft(a, b).value(0);

/**
 * Compute the interpolation parameters for the point on line `[p0 p1]`
 * that is closest to line `[q0 q1]`.
 * 
 * The returned value is `[num_p, num_q, denom]` and the interpolation params
 * are `num_p / denom` and `num_q / denom`, respectively.
 * 
 * Not yet performing the division gives application code the chance to
 * detect and handle (close-to-)zero denominator and/or numerators.
 */
export function closestLinePoints(
  p0: MV, p1: MV, q0: MV, q1: MV
): [number, number, number] {
  /*
  d0 := q0 - p0
  dp := p1 - p0
  dq := q1 - q0

  // The points of lines [p0 p1] and [q0 q1] closest to each other
  // in parametric form:
  p := (1-lambda_p)*p0 + lambda_p*p1
     = p0 + lambda_p*(p1 - p0)
     = p0 + lambda_p*dp
  q := (1-lambda_q)*q0 + lambda_q*q1
     = q0 + lambda_q*(q1 - q0)
     = q0 + lambda_q*dq

  // Vector between p and q:
  dpq := p - q
       = (p0 + lambda_p*dp) - (q0 + lambda_q*dq)
       = -(q0 - p0) + lambda_p*dp - lambda_q*dq
       = -d0 + lambda_p*dp - lambda_q*dq

  // dpq must be orthogonal to dq:
  dpq . dq = 0
  // substitute dpq
  (-d0 + lambda_p*dp - lambda_q*dq) . dq = 0
  // distribute ". dq"
  -d0.dq + lambda_p*dp.dq - lambda_q*dq.dq = 0
  // + d0.dq
  lambda_p*dp.dq - lambda_q*dq.dq = d0.dq                             (1)

  // dpq must be orthogonal to dp:
  dpq . dp = 0
  (-d0 + lambda_p*dp - lambda_q*dq) . dp = 0
  -d0.dp + lambda_p*dp.dp - lambda_q*dp.dq = 0
  lambda_p*dp.dp - lambda_q*dp.dq = d0.dp                             (2)

  // (1)*dp.dq - (2)*dq.dq:
  lambda_p*(dp.dq*dp.dq - dp.dp*dq.dq) = d0.dq*dp.dq - d0.dp*dq.dq
  lambda_p = (d0.dq*dp.dq - d0.dp*dq.dq) / (dp.dq*dp.dq - dp.dp*dq.dq)

  // (1)*dp.dp - (2)*dp.dq:
  lambda_q*(dp.dq*dp.dq - dq.dq*dp.dp) = d0.dq*dp.dp - d0.dp*dp.dq
  lambda_q = (d0.dq*dp.dp - d0.dp*dp.dq) / (dp.dq*dp.dq - dp.dp*dq.dq)

  // Notice that the denominator in the formulas for lambda_p and lambda_q
  // are the same.  When is it 0?
  dp.dq*dp.dq = dp.dp*dq.dq
  // lines are parallel (or one line has length 0): dq = he*alpha
  */
  const d0 = B.minus(q0, p0);
  const dp = B.minus(p1, p0);
  const dq = B.minus(q1, q0);
  const d0_dq = dot(d0, dq);
  const d0_dp = dot(d0, dp);
  const dp_dp = dot(dp, dp);
  const dp_dq = dot(dp, dq);
  const dq_dq = dot(dq, dq);
  const numerator_p = d0_dq * dp_dq - d0_dp * dq_dq;
  const numerator_q = d0_dq * dp_dp - d0_dp * dp_dq;
  const denominator = dp_dq * dp_dq - dp_dp * dq_dq;

  return [numerator_p, numerator_q, denominator];
}

/*
// In 2D closestLinePoints(...) becomes a line intersection,
// but there is an even simpler solution for this case:

// Define d0, dp, dq, p, q as above

// Intersection:
p = q
p0 + lambda_p*dp = q0 + lambda_q*dq
lambda_p*dp - lambda_q*dq = q0 - p0 = d0

// ^dp:
lambda_p*dp^dp - lambda_q*dq^dp = d0^dp
lambda_q = d0^dp / dp^dq

// ^dq:
lambda_p*dp^dq - lambda_q*dq^dq = d0^dq
lambda_p = d0^dq / dp^dq

// Both numerators and the common denominator are bivectors and thus
// scalar multiples of the 2D pseudoscalar, which cancels out in the division.
//
// Here it's even more obvious that the denominator is 0 if dp and dq
// are parallel (or one of them is degenerated to 0).
// If the d0 is also parallel to dp and dq (that is, the two lines coincide),
// then the numerators also become 0.
*/
