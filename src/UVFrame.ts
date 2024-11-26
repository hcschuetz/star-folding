import { Algebra, Multivector } from "./geometric-algebra/Algebra"
import { makeLetterNames } from "./geometric-algebra/componentNaming"
import NumericBackEnd from "./geometric-algebra/NumericBackEnd"
import { assert } from "./utils";


type MV = Multivector<never>;

export default
class UVFrame {
  constructor(
    readonly XYZ: Algebra<never>,
    readonly UV: Algebra<never>,
    readonly origin: MV,
    readonly u: MV,
    readonly v: MV,
  ) {
    assert(Math.abs(XYZ.normSquared(u) - 1) < 1e-8);
    assert(Math.abs(XYZ.normSquared(v) - 1) < 1e-8);
    assert(Math.abs(XYZ.scalarProduct(u, v)) < 1e-8);
  }

  UVOffsetToXYZ(o: MV) {
    const {XYZ, UV, u, v} = this;
    UV.checkMine(o);
    return XYZ.plus(
      XYZ.scale(o.value("u"), u),
      XYZ.scale(o.value("v"), v),
    )
  }

  UVPointToXYZ(p: MV) {
    return this.XYZ.plus(this.origin, this.UVOffsetToXYZ(p));
  }

  XYZOffsetToUV(p: MV) {
    const {XYZ, UV, u, v} = this;
    return UV.vec([
      XYZ.scalarProduct(u, p),
      XYZ.scalarProduct(v, p),
    ]);
  }

  XYZPointToUV(p: MV) {
    return this.XYZOffsetToUV(this.XYZ.minus(p, this.origin));
  }
}

function test() {
  const XYZ =
    new Algebra<never>([1, 1, 1], new NumericBackEnd(), makeLetterNames("xyz"));
  const UV =
    new Algebra<never>([1, 1], new NumericBackEnd(), makeLetterNames("uv"));

  const origin = XYZ.vec([-4, 3, -3]);
  const u = XYZ.normalize(XYZ.vec([5,2,-2]));
  const v = XYZ.normalize(XYZ.dual(XYZ.wedgeProduct(u, XYZ.vec([-.25,-3,.4]))));
  const frame = new UVFrame(XYZ, UV, origin, u, v);

  // Converting a point from UV to XYZ and back to UV leaves it unchanged:
  {
    const p = UV.vec([-.3,.2]);
    const pConverted = frame.XYZPointToUV(frame.UVPointToXYZ(p));
    assert(UV.dist(pConverted, p) < 1e-8);
  }

  // An offset vector in UV is mapped to a vector of the same length in XYZ
  {
    const p = UV.vec([2,8]);
    const lengthUV = UV.norm(p);
    const lengthXYZ = XYZ.norm(frame.UVOffsetToXYZ(p));
    assert(Math.abs(lengthXYZ - lengthUV) < 1e-8);
  }

  // An angle in UV is mapped to the same angle in XYZ
  {
    const p = UV.vec([2,8]);
    const q = UV.vec([-3,2]);
    const angleUV = UV.getAngle(p, q);
    const angleXYZ = XYZ.getAngle(frame.UVOffsetToXYZ(p), frame.UVOffsetToXYZ(q));
    assert(Math.abs(angleXYZ - angleUV) < 1e-8);
  }

  // Converting a point from XYZ to UV and back to XYZ projects it orthogonally
  // to the UV plane:
  {
    const p = XYZ.vec([2,-2,6]);
    const pConverted = frame.UVPointToXYZ(frame.XYZPointToUV(p));
    const pMotion = XYZ.minus(p, pConverted);
    assert(XYZ.scalarProduct(pMotion, u) < 1e-8);
    assert(XYZ.scalarProduct(pMotion, v) < 1e-8);
  }

  console.log("UVFrame test succeeded.");
}

// test();
