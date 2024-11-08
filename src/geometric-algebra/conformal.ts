import { Algebra, bitCount, fail, Multivector } from "./Algebra";
import { makeLetterNames } from "./componentNaming";
import { euclidean } from "./euclidean";
import NumericBackEnd from "./NumericBackEnd.js";

// -----------------------------------------------------------------------------
// Conformal-Geometric-Algebra machinery setup

// TODO Support symbolic computation (= code generation) in some of this code
// and move it to a CGA-utilities module.

const be = new NumericBackEnd();

// base space
const coordsB = "xyz";
export const B = new Algebra<never>(euclidean(coordsB), be, makeLetterNames(coordsB));

// representation space
const coordsR = coordsB + "pm"; // "e_plus"/"e_minus" directions
export const R = new Algebra<never>(euclidean(coordsB).concat([1, -1]), be, makeLetterNames(coordsR));

/** Convert a base-space 1-vector to a representation-space point */
export function baseToRepr(mv: Multivector<never>) {
  return new Multivector(R, add => {
    for (const [bm, val] of mv) {
      if (bitCount(bm) === 1) {
        add(bm, val);
      } else if (Math.abs(val) > 1e-8) {
        fail("baseToRepr: not a 1-vector");
      } // else ignore almost-zero non-grade-1 component
    }
    const i = 0.5 * B.normSquared(mv);
    add("m", i + 0.5);
    add("p", i - 0.5);
  }, {named: mv.name + "R"});
}

export const embedInR = (mv: Multivector<never>) => R.mv(mv.toObject());

/** Convert a representation-space point to a base-space 1-vector */
export function reprToBase(mv: Multivector<never>) {
  const result = new Multivector(B, add => {
    const o = (mv.value("m") - mv.value("p"));
    const scale = 1 / o;
    for (const [bm, val] of mv) {
      if (bitCount(bm) === 1) {
        if (!["p", "m"].includes(R.bitmapToString[bm])) {
          add(bm, scale * val);
        }
      } else if (Math.abs(val) > 1e-8) {
        fail("reprToBase: not a 1-vector");
      } // else ignore almost-zero non-grade-1 component
    }
  }, {named: mv.name + "B"});
  return result;
}

export const [ex, ey, ez, ep, em] = R.basisVectors();
export const ei = R.mv({m: 1, p: 1}, {named: "ei"}); // infinity
export const eo = baseToRepr(B.zero());     // origin

export const normalizeBivector = (bv: Multivector<never>) =>
  R.scale(1 / bv.value("pm"), bv);

// See [DFM09], p.363, Table 13.2
export const makeSphere = (center: Multivector<never>, surfacePoint: Multivector<never>) =>
  R.undual(R.plus(center, R.scale(R.scalarProduct(center, surfacePoint), ei)));

if (!true) {
  console.log(`These should be the same up to scaling:
    ${makeSphere(baseToRepr(B.vec([3,4,5])), baseToRepr(B.vec([3,4,6])))}
    ${R.wedgeProduct(
      baseToRepr(B.vec([3,4,6])),
      baseToRepr(B.vec([3,5,5])),
      baseToRepr(B.vec([4,4,5])),
      baseToRepr(B.vec([3,4,4])),
    )}`
  );
}

// See [DFM09], p.427, (14.13)
export function splitPointPair(pp: Multivector<never>) {
  let discriminant = R.scalarProduct(pp, pp);
  if (discriminant < 0) {
    if (discriminant > -1e-10) {
      discriminant = 0;
    } else {
      console.error("negative discriminant:", discriminant);
    }
  }
  const root = Math.sqrt(discriminant);
  const invDenominator = R.inverse(R.contractLeft(R.negate(ei), pp));
  return [1, -1].map(sgn =>
    R.geometricProduct(R.plus(pp, R.mv({1: sgn * root})), invDenominator)
  );
}
