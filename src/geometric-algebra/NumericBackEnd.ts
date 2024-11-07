import { BackEnd, Scalar, ScalarOpOptions } from "./Algebra";
import scalarOp from "./scalarOp";


/**
A back end for purely numeric input.

(It is essentially unused if optimizations in `Algebra` already pre-calculate
purely numeric expressions.)
*/
export default class NumericBackEnd implements BackEnd<never> {
  scalarOp(op: string, args: number[], options?: ScalarOpOptions): Scalar<never> {
    return scalarOp(op, args);
  }
}
