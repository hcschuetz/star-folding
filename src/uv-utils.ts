import { Algebra, Multivector } from "./geometric-algebra/Algebra";
import { makeLetterNames } from "./geometric-algebra/componentNaming";
import NumericBackEnd from "./geometric-algebra/NumericBackEnd";

type MV = Multivector<never>;

export const UV =
  new Algebra<never>([1, 1], new NumericBackEnd(), makeLetterNames("uv"));

export function intersectUV(p0: MV, p1: MV, q0: MV, q1: MV) {
  const d0 = UV.minus(q0, p0);
  const dp = UV.minus(p1, p0);
  const dq = UV.minus(q1, q0);
  const lambda_p =
      UV.wedgeProduct(d0, dq).value("uv") / UV.wedgeProduct(dp, dq).value("uv");
  return UV.plus(p0, UV.scale(lambda_p, dp));
}